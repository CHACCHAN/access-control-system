# カメラキャプチャ仕様

## 背景

Linux 版 Tauri(WebKitGTK)の getUserMedia() は、PipeWire 未整備のミニマルな
startx キオスク環境では動作しない。そのため実機では **Rust 側が v4l2 を直接叩いて**
フレームを取得し、フロントへはイベントで JPEG(base64)を渡す。

開発時にブラウザ単体で開いた場合のみ getUserMedia(`useCamera`)を使う。

## キャプチャスレッド(`src-tauri/src/camera_capture.rs`)

- `start_camera_capture` コマンドで開始、`stop_camera_capture` で停止。
  多重起動は防止され、先に動いているスレッドがあれば何もしない。
- 停止時はカメラ解放(スレッド終了)まで待ってから戻る(次回起動時の
  「デバイス使用中」エラー防止)。

### デバイス選択とフォーマット交渉

1. nokhwa で全カメラを列挙(/dev/video0 決め打ちにしない)。
2. 各デバイスについて次の順で開くことを試みる:
   MJPEG → YUYV → NV12 → 最高解像度(フォーマット不問)。
   要求解像度は 640x480@30fps(`CAPTURE_WIDTH` / `CAPTURE_HEIGHT`)。
3. さらに v4l2 の G_FMT / G_PARM で「デバイスが今出しているフォーマット」を照会し、
   完全一致の Exact 要求を最後の候補に足す。フォーマット列挙に正しく応答しない
   v4l2loopback(仮想カメラ)対策。
4. どの候補でも開けず、現在の出力が未対応フォーマットの場合は、フィーダー側の
   設定変更を促すエラーメッセージを返す。

### キャプチャループ

- ウォームアップ: 最初の 8 フレーム(`WARMUP_FRAMES`)は捨てる(自動露出の安定待ち)。
- 毎フレーム:
  1. デコード済み RGB を `SharedFrame`(Mutex)へ上書き — 推論用の共有。
  2. JPEG(品質は設定 `cameraJpegQuality`、既定 75)にエンコードし、base64 で
     `camera-frame` イベントとして emit — フロント表示用。
- ループ間隔は設定 `cameraFrameIntervalMs`(既定 100ms = 10fps)。設定はキャプチャ
  開始時に一度だけ読む(設定保存時は端末ごと再起動する運用のため)。
- エラー耐性: 単発のフレーム取得失敗は握りつぶし、15 回(`MAX_CONSECUTIVE_ERRORS`)
  連続で失敗したときだけ `camera-error` を emit して終了する(無人運用での復帰性重視)。

## フロント側の表示(`useNativeCameraFeed`)

- `camera-frame` イベントを受けて `<img src="data:image/jpeg;base64,...">` に反映する。
- デコードが届くペースより遅い場合は「最後に届いたフレームだけ」を適用し、
  古いフレームが積み上がらないようにする。
- `camera-error` 受信でエラー表示に切り替える。

## 推論との関係

推論(顔認証・ジェスチャー)は `SharedFrame` から直接読むため、フロントへの
配信頻度・品質(上記設定)は **推論精度に影響しない**。フレームが 3 秒より古い場合、
推論側は「カメラ映像なし」としてエラーを返す。
