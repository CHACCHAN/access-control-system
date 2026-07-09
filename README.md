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

### 2. Git の初期設定(各自)

GitLab は SSO 認証のため、通常のログインパスワードでは Git 操作(clone/push/pull)できません。**Personal Access Token** が必要です。

1. GitLab 右上のアバター → **Edit profile** → **Access Tokens**
2. スコープに `read_repository`, `write_repository` を選択してトークンを発行
3. 発行されたトークンは再表示できないため、必ず控えておく

```bash
git config --global user.name "あなたの名前"
git config --global user.email "あなたのメールアドレス"
git config --global credential.helper store
```

初回 `git push` / `git pull` 時にユーザー名とパスワード(発行したトークン)を求められます。以降は再入力不要です。

### 3. VS Code で Dev Container を開く

1. VS Code でこのフォルダを開く
2. 右下に出る通知、またはコマンドパレット(`Ctrl+Shift+P`)から **Dev Containers: Reopen in Container** を実行
3. 初回はイメージのビルドに数分〜十数分かかります(Rust ツールチェーン、Tauri CLI などをインストールするため)

コンテナ内には Rust、Bun、Tauri CLI、wasm-pack など開発に必要な一式が揃っています。

初回起動時に `postCreateCommand` で `.devcontainer/setup-models.sh` が実行され、ONNX モデル(InsightFace buffalo_l / OpenCV Zoo)と ONNX Runtime 共有ライブラリ(`libonnxruntime.so`)が `src-tauri/resources/` 以下へダウンロードされます(既に存在する場合はスキップ)。手動で実行する場合:

```bash
bash .devcontainer/setup-models.sh
```

### 4. 開発サーバーの起動

```bash
bun install
bun run dev
```

ブラウザで `http://localhost:5173` を開いて確認します(ポートフォワードは自動設定済み)。カメラ機能を使う場合、`localhost` は HTTPS 制約の対象外なのでそのまま動作します。

### 5. (任意) Tauri デスクトップアプリとしてビルド確認

```bash
cargo tauri build
```

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

## 環境変数

在室更新 API のトークンなど、秘匿情報は `.env` に記述します(Git 管理対象外)。プロジェクトルートに `.env.example` を用意しているので、これをコピーして値を埋めてください。

```bash
cp .env.example .env
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

拡張機能は `.devcontainer/devcontainer.json` に定義済みで、コンテナ起動時に自動インストールされます。
