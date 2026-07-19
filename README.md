# access-control-system

顔認証による在室管理アプリケーション。カメラ映像から学生を特定し、在室・外出・帰宅の状態を管理する。ジェスチャー(グー/チョキ/パー)による在室ステータスの更新にも対応する。

顔検出・顔認証・ジェスチャー認識の推論は全て Rust(Tauri backend)側の ONNX Runtime で実行する。フロントエンド(React)はカメラ映像の表示・推論中インジケータ・認識結果に応じたUI更新のみを担当する。

## 技術スタック

- **フロントエンド**: React + TypeScript + Vite
- **パッケージマネージャ**: Bun
- **デスクトップアプリ化**: Tauri v2 (Rust)
- **推論**: ONNX Runtime (`ort` クレート, load-dynamic) — CPU推論のみ
  - 顔検出: SCRFD (`det_10g.onnx`)
  - 顔アライメント: 106点ランドマーク (`2d106det.onnx`)
  - 顔認証: ArcFace 512次元 embedding (`w600k_r50.onnx`)
  - ジェスチャー: MediaPipe 手のひら検出 + 21点手指ランドマーク (OpenCV Zoo 変換モデル)

## 開発環境のセットアップ

このプロジェクトは [Dev Containers](https://containers.dev/) を前提としています。VS Code + Dev Containers 拡張機能があれば、環境構築はコンテナが自動で行います。

### 1. リポジトリの clone

```bash
git clone https://repository.naka.ai.chibatech.ac.jp/role_laboratory_staff/access-control-system.git
cd access-control-system
```

clone方式(SSH/HTTPS)やGitHubとの併用など、リモートの運用方法は各自の環境に合わせて自由に設定してください。

初回のみ、コミット時の作者情報を設定します。

```bash
git config --global user.name "あなたの名前"
git config --global user.email "あなたのメールアドレス"
```

### 2. VS Code で Dev Container を開く

1. VS Code でこのフォルダを開く
2. 右下に出る通知、またはコマンドパレット(`Ctrl+Shift+P`)から **Dev Containers: Reopen in Container** を実行
3. 初回はイメージのビルドに数分〜十数分かかります(Rust ツールチェーン、Tauri CLI などをインストールするため)

コンテナ内には Rust、Bun、Tauri CLI、wasm-pack など開発に必要な一式が揃っています。

`node_modules` / `dist` / `src-tauri/target` は Docker の named volume にマウントされており、ホストとの bind mount より高速に動作します(コンテナを再作成してもキャッシュは保持されます)。

初回起動時、`postCreateCommand` で以下が自動実行されます。

1. `.devcontainer/postCreateCommand.sh` — 上記 named volume の権限調整(`vscode` ユーザーへの chown)と `bun install`
2. `.devcontainer/setup-models.sh` — ONNX モデル(InsightFace buffalo_l / OpenCV Zoo)と ONNX Runtime 共有ライブラリ(`libonnxruntime.so`)を `src-tauri/resources/` 以下へダウンロード(既に存在する場合はスキップ)

手動で再実行したい場合:

```bash
bash .devcontainer/postCreateCommand.sh
bash .devcontainer/setup-models.sh
```

### 3. 開発サーバーの起動

```bash
bun run dev
```

起動すると Vite のリンクがターミナルに表示されるので(`Local: http://localhost:xxxx/` の形式)、**ターミナルに表示されたリンク**をブラウザで開いて確認します(ポートフォワードは自動設定済み)。

このブラウザ起動は UI と API 連携の確認向けです。カメラ取得・顔認証・ジェスチャー認識・電源操作は Tauri/Rust のネイティブ機能を使うため、次のコマンドで確認します。

```bash
bun run tauri dev
```

ブラウザでは Tauri 固有の起動診断をスキップし、利用可能なブラウザ機能のみ確認します。

なお `bun run dev` は Vite と同時に、外部 API への CORS 回避用の中継サーバー(既定: localhost:8787)も起動します。詳細は [docs/api/http-routing.md](docs/api/http-routing.md) を参照してください。

### 4. (任意) Tauri デスクトップアプリとしてビルド確認

```bash
cargo tauri build
```

ビルド成果物(deb)と実機へのアップデート手順は [docs/system/build-and-deploy.md](docs/system/build-and-deploy.md) を参照してください。

## ディレクトリ構成

```
access-control-system/
├── src/              # React側のソースコード(表示のみ。推論は行わない)
├── src-tauri/        # Tauriバックエンド(Rust)
│   ├── src/vision/   # 顔認証・ジェスチャー認識の推論パイプライン
│   └── resources/    # 学習済みモデル(.onnx)・libonnxruntime.so (Git管理外)
├── public/           # 静的ファイル
└── .devcontainer/    # 開発コンテナ設定・モデル取得スクリプト
```

## ドキュメント

アプリケーションの仕様書は [docs/](docs/README.md) にあります(仕様領域ごとにディレクトリ分け)。
ビルド・実機アップデートの手順は [docs/system/build-and-deploy.md](docs/system/build-and-deploy.md) を参照してください。

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

拡張機能は `.devcontainer/devcontainer.json` に定義済みで、コンテナ起動時に自動インストールされます。

## ライセンス

MIT License([LICENSE](LICENSE))。作成者: Yuya Nakayama(中山裕哉 24G3102)
