# 顔認証(認識・照合)仕様

## 概要

カメラに写った顔を検出し、登録済みメンバーの顔特徴ベクトル(embedding)と 1:N 照合して
本人を特定する。特定後は確認カード(「◯◯さんですか?」)を表示し、承認されると
在室ステータスの操作シートへ進む。

推論はすべて Rust 側(`src-tauri/src/vision/`)で実行され、フロントエンドは
`recognize_face` コマンドの結果だけを扱う。

## パイプライン(Rust 側 / `recognize_face`)

1. **フレーム取得** — `SharedFrame` から最新のデコード済み RGB フレームを読む。
   3秒(`FRAME_STALE_MS`)より古いフレームしか無い場合は「カメラ映像なし」エラー。
2. **顔検出** — SCRFD(det_10g.onnx)。最もスコアの高い顔1件を対象とする。
   検出結果の bbox・スコアは常に返す(オーバーレイ描画用)。
3. **顔サイズゲート** — 顔幅がフレーム幅の `minFaceWidthRatio`(既定 0.15)未満なら
   照合せず終了(遠くの顔に高コストな照合をかけない)。
4. **ランドマーク補正** — 2d106det.onnx の106点ランドマークから5点を作りアライメント。
   妥当性チェックに失敗した場合は SCRFD の5点にフォールバック。
5. **embedding 抽出** — ArcFace(w600k_r50.onnx)で 512次元・正規化済みベクトルを抽出。
6. **1:N 照合** — 登録済み全件とコサイン類似度を計算。
   - 1位のスコアが `matchThreshold`(既定 0.5)以上で本人判定
   - ただし登録が2件以上あり、1位と2位の差が `matchMargin`(既定 0.05)未満なら
     誤認識防止のため「該当者なし」

閾値・比率は設定(パフォーマンス設定)で調整可能。→ [settings/settings.md](../settings/settings.md)

## レスポンス(`FaceAuthResult`)

```ts
{
  faceDetected: boolean;
  bbox: [x, y, width, height] | null;  // フレーム座標
  detScore: number;
  frameWidth: number; frameHeight: number;
  recognized: boolean;
  userId: string | null;               // 一致したメンバーの username
  confidence: number;                  // 1位のコサイン類似度
}
```

## フロント側ループ(`useFaceRecognitionLoop`)

- `recognitionIntervalMs`(既定 1000ms)間隔でポーリング。前回の推論が終わるまで次は投げない。
- **連続一致ガード**: 同一人物が `recognitionStableCount`(既定 1)回連続で認識されたときだけ
  確認カードを表示する。別人・非検出でカウントはリセット。
- 顔幅比率が 0.32(`CLOSE_THRESHOLD`)未満のうちは「もう少し近づいてください」を表示。
- 確認カード表示中は照合をやり直さず、2回(`MISS_STREAK_TO_DISMISS`)連続で顔が
  検出されなければ離れたとみなしてカードを自動で閉じる。

## 検出オーバーレイ

検出 bbox とスコアをカメラ映像の上の canvas に描画する。映像(img/video)は
`object-cover` で表示されるため、canvas 側はコンテナの実表示サイズに合わせ、
フレーム座標を「大きい方の倍率で拡大して中央寄せ」(object-cover と同一)の変換で
表示座標へ写像してから描く。映像が CSS で左右反転(ミラー)表示されるのに合わせて
canvas も反転し、ラベル文字だけ再反転して可読性を保つ。
枠の色はアクセントカラー設定(`--color-cyan-400`)に追従する。

## 登録済み顔の同期

- メンバー一覧 API が返す `descriptor`(512次元)を初期値とし、セッション中に
  端末で登録した顔で上書きした一覧を、変更のたびに `set_enrolled_faces` で Rust 側へ同期する。
- 512次元以外のベクトル(旧 faceapi.js 時代の128次元など)は Rust 側で照合対象外となる。

## 起動時初期化

ONNX Runtime とモデル5点のロードは `init_vision`(冪等)で行い、ブートチェック時に
実行される。モデルパスの解決規約は `src-tauri/src/vision/paths.rs` を参照。
