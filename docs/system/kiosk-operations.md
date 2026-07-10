# キオスク運用仕様

無人運用の研究室キオスク端末としての運用機能。deb(Linux)配布・startx がアプリを
X セッション唯一のクライアントとして起動する構成を前提とする。

## 電源・セッション操作(Rust コマンド)

| コマンド | 実装 | 用途 |
|---|---|---|
| `restart_computer` | `systemctl reboot` | 端末の再起動(設定保存後の自動再起動にも使用) |
| `shutdown_computer` | `systemctl poweroff` | 端末の電源断 |
| `exit_app` | `app.exit(0)` | アプリ終了 → X セッションごと終了し startx 前のシェルへ戻る |

- 画面上の操作は `SystemControlPanel`(電源系)と設定「システム」の
  「シェルに戻る」(確認付き danger zone)から行う。

## スケジュール機能

1 分間隔で現在時刻(HH:MM)を監視し、日付込みの発火キーで「その日 1 回だけ」
実行する(翌日は再度発火する)。

| 設定 | 動作 |
|---|---|
| rebootSchedule | 一致時刻に端末を自動再起動 |
| screenOffSchedule | 一致時刻に画面を暗転(ScreenDimmer) |

### 画面暗転(ScreenDimmer)

- スリープではなく、黒レイヤーの不透明度を約 12 秒かけて上げる演出。
- ユーザー操作(pointerdown / mousemove / keydown / touchstart)で約 0.4 秒で復帰。

## 設定保存と再起動

実機では設定保存時に確認モーダルを挟んだうえで端末を自動再起動し、
エンドポイント変更・Rust 側パラメータ等を確実に反映する。

## 障害への復帰性

- カメラ: 単発のフレーム取得エラーは握りつぶし、15 回連続失敗時のみエラー通知。
  キャプチャスレッドが自己終了していた場合、次の `start_camera_capture` で回収して再起動。
- WebSocket: 切断時 5 秒間隔で自動再接続。
- 顔登録オーバーレイ: 60 秒放置で自動的に認証モードへ復帰。
- 設定読み込み失敗時は既定値で起動(起動不能を避ける)。

## WebKit 権限(Linux 固有)

WebKitGTK ではカメラ等の権限要求がデフォルト拒否のため、起動時に
`UserMediaPermissionRequest` / `DeviceInfoPermissionRequest` を自動許可する
ハンドラーを登録している(キオスク専用端末での常時カメラ利用を前提とした設計)。
併せて `console.log` を標準出力へ書き出す設定を有効化し、Web Inspector なしで
フロントのログを追えるようにしている。

## 配布・アップデート

- `tauri build` で deb を生成。ONNX モデル(5 点)と libonnxruntime.so を
  リソースとして同梱する(`tauri.conf.json` の `bundle.resources`)。
- HTTP アクセスは capability で `https://*.chibatech.ac.jp/*` に制限。
