#!/bin/bash
# .devcontainer/setup-models.sh
set -e

MODEL_DIR="src-tauri/resources/models"
mkdir -p "$MODEL_DIR/gesture" "$MODEL_DIR/buffalo_l"

# ジェスチャー用モデル(未存在時のみダウンロード)
if [ ! -f "$MODEL_DIR/gesture/palm_detection_mediapipe_2023feb.onnx" ]; then
  wget -O "$MODEL_DIR/gesture/palm_detection_mediapipe_2023feb.onnx" \
    https://github.com/opencv/opencv_zoo/raw/main/models/palm_detection_mediapipe/palm_detection_mediapipe_2023feb.onnx
fi

if [ ! -f "$MODEL_DIR/gesture/handpose_estimation_mediapipe_2023feb.onnx" ]; then
  wget -O "$MODEL_DIR/gesture/handpose_estimation_mediapipe_2023feb.onnx" \
    https://github.com/opencv/opencv_zoo/raw/main/models/handpose_estimation_mediapipe/handpose_estimation_mediapipe_2023feb.onnx
fi

# buffalo_l一式(zipなので解凍込み)
if [ ! -f "$MODEL_DIR/buffalo_l/w600k_r50.onnx" ]; then
  wget -O /tmp/buffalo_l.zip \
    https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip
  unzip -o /tmp/buffalo_l.zip -d "$MODEL_DIR/buffalo_l"
fi

echo "Model setup complete."