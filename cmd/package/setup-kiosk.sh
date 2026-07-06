#!/bin/bash
# setup-kiosk.sh
#
# Debian 13 (trixie) 最小構成(GUIなし)に対して、
# Tauriアプリのキオスク実行環境を構築するセットアップスクリプト。
#
# 実行後、自動的に再起動し、以降は
#   電源投入 → 自動ログイン(root, tty1) → 自動でXサーバー起動 → キオスクアプリ表示
# という流れで無人起動するようになる。
#
# 緊急時は Ctrl+Alt+F2 等で別のTTYに切り替えれば、rootのCUIに脱出できる
# (これは標準のLinux機能で、本スクリプトは一切変更・無効化しない)。
#
# 前提:
#   - このスクリプトと同じディレクトリに access-control-system.deb を置いておくこと
#   - root で実行すること
#
# 使い方:
#   bash setup-kiosk.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEB_FILE_PATH="${SCRIPT_DIR}/access-control-system.deb"

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run with root privileges (e.g., sudo bash setup-kiosk.sh)"
  exit 1
fi

# ===== 1. SSHの無効化(キオスク端末のため、外部アクセスを一切許可しない) =====
if systemctl list-unit-files | grep -q '^ssh.service'; then
  systemctl disable ssh
  systemctl stop ssh
  echo "The SSH service has been disabled"
fi

# ===== 2. Xサーバー・Tauri依存ライブラリのインストール =====
apt update
apt install -y --no-install-recommends xserver-xorg xinit
apt install -y libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1 librsvg2-2

# ===== 3. .deb ファイルのインストール =====
if [ -f "$DEB_FILE_PATH" ]; then
  dpkg -i "$DEB_FILE_PATH" || apt install -f -y
  echo "Installed the .deb file.: $DEB_FILE_PATH"
else
  echo "Error: $DEB_FILE_PATH not found"
  echo "Place access-control-system.deb in the same directory as this script and then run it again"
  exit 1
fi

# ===== 4. アプリ自動起動設定(.xinitrc) =====
cat > /root/.xinitrc << 'EOF'
exec access-control-system
EOF

# ===== 5. tty1 での root 自動ログイン設定 =====
# (Ctrl+Alt+F2 等で他のTTYに切り替えれば、通常通りログインプロンプトが表示される。
#  この設定は tty1 のみに影響する。)
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/override.conf << 'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear %I $TERM
EOF
systemctl daemon-reload

# ===== 6. tty1 ログイン後、自動で startx を実行する設定 =====
if ! grep -q 'startx' /root/.bash_profile 2>/dev/null; then
  cat >> /root/.bash_profile << 'EOF'

# tty1 での自動ログイン後、自動的にXサーバー(キオスクアプリ)を起動する。
# 他のTTY(Ctrl+Alt+F2など)からの通常ログインには影響しない。
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  startx
fi
EOF
fi

echo ""
echo "===================================="
echo "Setup complete"
echo "Automatic login via tty1 will launch the kiosk app automatically"
echo "In case of emergency, switch to a different TTY using Ctrl+Alt+F2 and log in as usual"
echo "===================================="