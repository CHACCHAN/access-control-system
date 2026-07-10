# ジェスチャー操作仕様

## 概要

在室ステータス操作シート(メンバー選択後の画面)の表示中、カメラに向けた手の形
(グー / チョキ / パー)を認識し、設定されたマッピングに従って在室ステータスを
自動で更新する。タップ操作の代替手段であり、シート表示中のみ動作する。

## 認識パイプライン(Rust 側 / `detect_gesture`)

1. `SharedFrame` から最新フレームを取得(3秒より古ければエラー)。
2. **手のひら検出** — palm_detection_mediapipe(OpenCV Zoo 変換版)。
3. **手指ランドマーク推定** — handpose_estimation_mediapipe。
4. 指の屈伸状態からジェスチャーを分類: `Rock` / `Scissors` / `Paper` / `Unknown`。
5. 設定ストア(settings.json)の `gestureStatusMap` を参照し、ジェスチャーに
   割り当てられた在室ステータス(`roomStatus`)を付けて返す。空文字の割り当ては
   「そのジェスチャーでは更新しない」を意味し `null` を返す。

## レスポンス(`GestureResult`)

```ts
{
  handDetected: boolean;
  gesture: "Rock" | "Scissors" | "Paper" | "Unknown";
  confidence: number;
  roomStatus: string | null;  // gestureStatusMap 適用結果
}
```

## フロント側ループ(`AttendanceActionSheet`)

- シート表示中のみ `gesturePollIntervalMs`(既定 700ms)間隔でポーリング。
  シート表示中は顔認証ループが停止しているため CPU を取り合わない。
- **連続一致ガード**: 同じジェスチャーが `gestureStableCount`(既定 2)回連続した
  ときだけステータス更新を発火する(誤爆防止)。
- 発火時は在室状況更新 API(→ [api/external-api.md](../api/external-api.md))を呼び、
  成功したらローカルの一覧表示も即時更新する。
- 現在のステータスと同じ値への更新は発火しない。

## マッピング設定

設定画面「ジェスチャー」セクションで、各ジェスチャーに在室 / 外出 / 帰宅 / なし を
割り当てる。既定値:

| ジェスチャー | 既定ステータス |
|---|---|
| ✊ グー | 在室 |
| ✌️ チョキ | 外出 |
| ✋ パー | 帰宅 |

キー名(rock / scissors / paper)と既定値はフロント(useSettings.ts)と
Rust(vision/mod.rs)で揃えること。

## 操作ガイド表示

シート下部に、ステータスが割り当てられているジェスチャーだけを凡例として表示する。
検出中のジェスチャーはハイライトされる。
