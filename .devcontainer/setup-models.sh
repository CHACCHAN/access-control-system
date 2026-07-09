#!/bin/bash
# .devcontainer/setup-models.sh
#
# 顔認証・ジェスチャー認識で使う ONNX モデルと ONNX Runtime 共有ライブラリを
# 取得する。モデルは大容量のためリポジトリにはコミットせず、devcontainer の
# 初回起動時(postCreateCommand)にダウンロードする。
# 「ファイルが既に存在する場合はスキップ」する冪等な実装。
# GitHub へのネットワークアクセスが必要。
set -e

MODEL_DIR="src-tauri/resources/models"
ORT_DIR="src-tauri/resources/onnxruntime"
# Rust 側の ort クレート(=2.0.0-rc.12)が対応する ONNX Runtime のバージョン。
# ort を更新する場合はここも合わせて更新すること。
ORT_VERSION="1.27.0"

mkdir -p "$MODEL_DIR/gesture" "$MODEL_DIR/buffalo_l" "$ORT_DIR"

# ジェスチャー用モデル(OpenCV Zoo 経由の MediaPipe 変換モデル / Apache 2.0)
if [ ! -f "$MODEL_DIR/gesture/palm_detection_mediapipe_2023feb.onnx" ]; then
  wget -O "$MODEL_DIR/gesture/palm_detection_mediapipe_2023feb.onnx" \
    https://github.com/opencv/opencv_zoo/raw/main/models/palm_detection_mediapipe/palm_detection_mediapipe_2023feb.onnx
fi

if [ ! -f "$MODEL_DIR/gesture/handpose_estimation_mediapipe_2023feb.onnx" ]; then
  wget -O "$MODEL_DIR/gesture/handpose_estimation_mediapipe_2023feb.onnx" \
    https://github.com/opencv/opencv_zoo/raw/main/models/handpose_estimation_mediapipe/handpose_estimation_mediapipe_2023feb.onnx
fi

# 顔認証用: InsightFace buffalo_l 一式(zipなので解凍込み)。
# 使用するのは det_10g / w600k_r50 / 2d106det の3つのみで、
# 1k3d68(3Dランドマーク)と genderage(性別年齢)は使わないため削除する。
if [ ! -f "$MODEL_DIR/buffalo_l/w600k_r50.onnx" ]; then
  wget -O /tmp/buffalo_l.zip \
    https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip
  unzip -o /tmp/buffalo_l.zip -d "$MODEL_DIR/buffalo_l"
  rm -f /tmp/buffalo_l.zip
fi
rm -f "$MODEL_DIR/buffalo_l/1k3d68.onnx" "$MODEL_DIR/buffalo_l/genderage.onnx"

# ONNX Runtime 共有ライブラリ(Microsoft 公式ビルド)。
# Rust 側は ort クレートの load-dynamic 機能でこの .so を実行時に読み込む。
# 公式ビルドは glibc 2.27+ 対応のため、devcontainer(bookworm)でも
# 本番機(Debian 13)でも同じバイナリが動く。
if [ ! -f "$ORT_DIR/libonnxruntime.so" ]; then
  wget -O /tmp/onnxruntime.tgz \
    "https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-x64-${ORT_VERSION}.tgz"
  tar xzf /tmp/onnxruntime.tgz -C /tmp
  # シンボリックリンクではなく実体をコピーする(deb 同梱時のリンク切れを防ぐ)
  cp "/tmp/onnxruntime-linux-x64-${ORT_VERSION}/lib/libonnxruntime.so.${ORT_VERSION}" \
    "$ORT_DIR/libonnxruntime.so"
  rm -rf /tmp/onnxruntime.tgz "/tmp/onnxruntime-linux-x64-${ORT_VERSION}"
fi

echo "Model setup complete."
