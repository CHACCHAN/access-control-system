#!/bin/bash
# build-iso.sh
#
# /workspace/cmd/package/ 以下に配置された
#   - preseed.cfg
#   - setup-kiosk.sh
#   - access-control-system.deb
# をまとめて、preseed用の追加ISOイメージを作成する。
#
# 出力: /workspace/cmd/preseed-media.iso
#
# 使い方:
#   bash /workspace/cmd/build-iso.sh

set -e

CMD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="${CMD_DIR}/package"
OUTPUT_ISO="${CMD_DIR}/preseed-media.iso"

REQUIRED_FILES=("preseed.cfg" "setup-kiosk.sh" "access-control-system.deb")

echo "Input file verification"
for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "${PACKAGE_DIR}/${f}" ]; then
    echo "エラー: ${PACKAGE_DIR}/${f} が見つかりません。"
    exit 1
  fi
  echo "OK: ${f}"
done

echo ""
echo "Creating an ISO image"
genisoimage -o "${OUTPUT_ISO}" -V "PRESEED" -J -R "${PACKAGE_DIR}/"

echo ""
echo "created an ISO image: ${OUTPUT_ISO}"