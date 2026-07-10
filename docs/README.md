# access-control-system 仕様書

研究室の在室管理を行うキオスク端末アプリケーション(Tauri v2 + React 19)の仕様書です。
仕様領域ごとにディレクトリを分けて配置しています。

## 目次

| 領域 | ドキュメント | 内容 |
|---|---|---|
| 概要 | [overview/architecture.md](overview/architecture.md) | アプリ全体像・技術スタック・プロセス構成 |
| 顔認証 | [face-auth/face-recognition.md](face-auth/face-recognition.md) | 顔検出〜1:N照合パイプライン |
| 顔認証 | [face-auth/face-registration.md](face-auth/face-registration.md) | 顔登録(embedding抽出・サーバー登録) |
| ジェスチャー | [gesture/gesture-control.md](gesture/gesture-control.md) | 手の形による在室ステータス更新 |
| カメラ | [camera/camera-capture.md](camera/camera-capture.md) | v4l2キャプチャ・フロントへの映像配信 |
| API連携 | [api/external-api.md](api/external-api.md) | メンバー取得・在室更新・顔登録・WebSocket |
| API連携 | [api/http-routing.md](api/http-routing.md) | 実行環境ごとの通信経路(CORS回避を含む) |
| 設定 | [settings/settings.md](settings/settings.md) | 設定項目一覧・保存方式・Rust側との共有 |
| UI | [ui/screens.md](ui/screens.md) | 画面仕様(ブートチェック・トップ・設定) |
| UI | [ui/design-customization.md](ui/design-customization.md) | テーマ・アクセントカラー・レイアウトのカスタマイズ |
| 運用 | [system/kiosk-operations.md](system/kiosk-operations.md) | キオスク運用(再起動・消灯・終了・スケジュール) |

## クレジット

- 作成者: 中山裕哉 (24G3102)
- ライセンス: MIT License
