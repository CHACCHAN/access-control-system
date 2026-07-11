# 設定仕様

## 保存方式

- `tauri-plugin-store` により、OS 標準の設定ディレクトリ配下の `settings.json` に
  `settings` キーで一括保存される(ブラウザ単体実行時は保存されず既定値のみ)。
- 設定画面は draft(編集バッファ)方式。どのセクションを編集しても、ヘッダーの
  「保存」1つで全設定が保存される。
- **実機では保存後に端末を自動再起動**して設定を確実に反映する(保存前に確認モーダルあり)。
- 読み込み時は既定値とのマージを行い、後からキーが増えても古い保存データで
  欠損しない(ネストした `gestureStatusMap` / `performance` / `appearance` は個別にマージ)。

## Rust 側との共有

Rust 側(`src-tauri/src/settings.rs`・`vision/mod.rs`)も同じ settings.json を読む。

- `performance.camera*` / `match*` / `minFaceWidthRatio` — 推論・キャプチャのパラメータ
- `gestureStatusMap` — ジェスチャー→ステータスのマッピング

キー名と既定値はフロント(`src/shared/hooks/useSettings.ts`)と Rust で揃えること。
Rust 側は不正値を安全な範囲にクランプし、未設定なら既定値へフォールバックする。

## 設定項目一覧

### 一般(GENERAL)

| キー | 既定値 | 内容 |
|---|---|---|
| theme | dark | ライト / ダークテーマ |
| uiScale | 1.0 | UI 全体の拡大率(0.8〜1.5)。ルート font-size を倍率で変え、rem ベースのサイズ・余白・文字を一括で拡大縮小 |
| rebootSchedule | (空) | 毎日この時刻(HH:MM)に端末を自動再起動 |
| screenOffSchedule | (空) | この時刻に画面を暗転(操作で復帰) |

`uiScale` は設定画面で編集中もライブプレビューされ、保存せず閉じると元に戻る。
不正・範囲外の値は読み込み時に 0.8〜1.5 へクランプされる。

### デザイン(APPEARANCE)→ 詳細は [ui/design-customization.md](../ui/design-customization.md)

| キー | 既定値 | 内容 |
|---|---|---|
| appearance.accentColor | cyan | アクセントカラー(cyan/blue/emerald/violet/rose/amber) |
| appearance.backgroundPattern | grid | 背景パターン(grid/dots/diagonal/none) |
| appearance.memberListLayout | grid | メンバー一覧レイアウト(grid/compact/list) |
| appearance.memberPanelBg | (空) | トップ左パネルの背景色(空は既定) |
| appearance.authPanelBg | (空) | トップ右パネルの背景色(空は既定) |

### パフォーマンス(PERFORMANCE)

| キー | 既定値 | 反映 | 内容 |
|---|---|---|---|
| performance.recognitionIntervalMs | 1000 | 即時 | 顔認証の推論間隔(ms) |
| performance.recognitionStableCount | 1 | 即時 | 顔認証の連続一致回数(確認カード表示まで) |
| performance.gesturePollIntervalMs | 700 | 即時 | ジェスチャー認識の間隔(ms) |
| performance.gestureStableCount | 2 | 即時 | ジェスチャーの連続一致回数 |
| performance.cameraFrameIntervalMs | 100 | 再起動後 | カメラ映像の送信間隔(ms)。100ms=10fps |
| performance.cameraJpegQuality | 75 | 再起動後 | カメラ映像の JPEG 品質(10-100) |
| performance.matchThreshold | 0.5 | 再起動後* | 照合閾値(コサイン類似度) |
| performance.matchMargin | 0.05 | 再起動後* | 1位2位の差がこれ未満なら該当者なし |
| performance.minFaceWidthRatio | 0.15 | 再起動後* | 照合する最小顔サイズ比率 |

\* Rust 側は推論のたびに設定を読むため技術的には即時反映されるが、保存操作自体が
実機では再起動を伴うため、運用上は「保存(=再起動)後に反映」となる。

### API 接続(CONNECTION)

| キー | 内容 |
|---|---|
| getEndpoint | メンバー一覧取得 API(GET) |
| postEndpoint | 顔特徴ベクトル登録 API(POST {postEndpoint}/{username}) |
| attendanceEndpoint | 在室状況更新 API(POST) |
| wsEndpoint | 更新シグナル WebSocket |
| apiToken | Authorization ヘッダーへそのまま送る値(例: `Bearer xxx`) |

### API ボディ(REQUEST BODY)

| キー | 既定値 |
|---|---|
| descriptorBodyTemplate | `{"descriptor": "{{descriptor}}"}` |
| attendanceBodyTemplate | `{"userName": "{{username}}", "name": "{{name}}", "newStatus": "{{status}}"}` |
| wsSignalField / wsSignalValue | `message` / `update` |

### ジェスチャー(GESTURE)

| キー | 既定値 |
|---|---|
| gestureStatusMap.rock | 在室 |
| gestureStatusMap.scissors | 外出 |
| gestureStatusMap.paper | 帰宅 |

空文字は「割り当てなし(そのジェスチャーでは更新しない)」。

### ログ(LOGS)/ システム(SYSTEM)

- ログ: アプリ内イベントログの閲覧。
- システム: バージョン表示、アプリ終了(シェルに戻る)、クレジット
  (作成者: 中山裕哉 24G3102 / MIT License)。
