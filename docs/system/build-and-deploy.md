# ビルドとアップデート手順

実機(キオスク端末)は **Debian 13** を前提とし、アプリは deb パッケージとして
配布・インストールする。

## 実機ランタイム要件

deb のインストールだけでは、キオスク固有のハードウェア操作に必要なコマンドや
権限までは構成されない。アプリを起動するユーザーについて、次を満たすこと。

| 対象 | 要件 | アプリ内での用途 |
|---|---|---|
| X11 / DPMS | X セッション上で起動し、`xset`(`x11-xserver-utils`)を実行できること | X 側の自動消灯無効化、画面の物理消灯・復帰 |
| ALSA | `amixer`(`alsa-utils`)を実行し、Master または PCM ミキサーを操作できること | 設定画面からのハードウェア音量変更 |
| systemd | `systemctl reboot` / `systemctl poweroff` を実行できること | 再起動、定時再起動、シャットダウン |
| カメラ | 対象の `/dev/video*` を読み書きできること(通常は `video` グループ) | Rust / v4l2 によるカメラキャプチャ |

必要なコマンドの導入例:

```bash
sudo apt install x11-xserver-utils alsa-utils
sudo usermod -aG video <キオスクユーザー>
```

グループ追加は再ログインまたは再起動後に反映される。併せて、キオスクユーザーが
ローカルのアクティブセッションとして systemd-logind / polkit から再起動・電源断を
許可されていること、`DISPLAY` が起動中の X セッションを指していて `xset` が成功する
こと、`amixer` が対象ミキサーを操作できることを実機で確認する。

## ビルド

### 前提

- Dev Container 内で作業する(Rust / Bun / Tauri CLI が揃っている)。
- ONNX モデルと `libonnxruntime.so` が `src-tauri/resources/` に配置されていること。
  無い場合は先に取得する(deb に同梱されるため必須):

```bash
bash .devcontainer/setup-models.sh
```

### バージョンの更新

リリース時は以下 3 ファイルのバージョンを揃えて上げる:

- `package.json` の `version`
- `src-tauri/tauri.conf.json` の `version`
- `src-tauri/Cargo.toml` の `version`

### ビルド実行

```bash
cargo tauri build
```

- フロントエンドのビルド(`bun run build` = tsc + vite build)が自動で先に実行される
  (`tauri.conf.json` の `beforeBuildCommand`)。
- 成果物(deb)は次の場所に生成される:

```
src-tauri/target/release/bundle/deb/access-control-system_<バージョン>_amd64.deb
```

- deb には ONNX モデル 5 点と `libonnxruntime.so` がリソースとして同梱される。
  CPU 命令セットは実行時ディスパッチのため、AVX2 非対応の旧型 CPU
  (本番機 i7-3770 / Ivy Bridge)でもそのまま動作する。

## 実機へのアップデート

ビルドした deb を実機に転送し、`dpkg -i` で上書きインストールする。

```bash
# 1. deb を実機へ転送(scp / USB メモリなど)
scp src-tauri/target/release/bundle/deb/access-control-system_<バージョン>_amd64.deb <実機>:~/

# 2. 実機側でインストール(旧バージョンはそのまま上書きされる)
sudo dpkg -i access-control-system_<バージョン>_amd64.deb

# 3. 反映のため再起動(startx がアプリを自動起動する運用のため)
sudo reboot
```

- 事前のアンインストールは不要。`dpkg -i` が同名パッケージを上書き更新する。
- インストール済みバージョンの確認:

```bash
dpkg -s access-control-system | grep Version
```

- アプリ内でもバージョンを確認できる(設定 → システム、および設定ページのヘッダー)。

## 設定の引き継ぎ

アプリ設定(エンドポイント・トークン・デザイン等)は OS の設定ディレクトリ配下の
`settings.json`(tauri-plugin-store)に保存されており、**アップデートしても消えない**。
新しいバージョンで設定項目が増えた場合は既定値とマージされる。

## 初期セットアップ(参考)

実機の新規プロビジョニング(自動ログイン・startx でのアプリ自動起動などの
キオスク化設定、および dev.sh に記載の配置手順)は本書の範囲外とする。
既にセットアップ済みの端末に対するアップデートは、上記の `dpkg -i` + 再起動だけでよい。
