import { useEffect, useState } from "react";

type DetectorStatus = "idle" | "loading-model" | "ready" | "error";

interface UseFaceDetectorResult {
  detector: any | null;
  status: DetectorStatus;
  error: string | null;
}

const MODEL_URL = "/models/face_detection_yunet.onnx";
const MODEL_FS_PATH = "face_detection_yunet.onnx";

// YuNet の入力サイズ。カメラ側の解像度(useCamera で ideal: 640x480 を指定)と合わせる。
const INPUT_WIDTH = 320;
const INPUT_HEIGHT = 320;
const SCORE_THRESHOLD = 0.9;
const NMS_THRESHOLD = 0.3;
const TOP_K = 5000;

/**
 * OpenCV.js の仮想ファイルシステムにモデルファイルを配置し、
 * cv.FaceDetectorYN のインスタンスを生成するフック。
 *
 * cv (OpenCV.js のルートオブジェクト) が渡されるまでは何もしない。
 */
export function useFaceDetector(cv: any | null): UseFaceDetectorResult {
  const [detector, setDetector] = useState<any | null>(null);
  const [status, setStatus] = useState<DetectorStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cv) return;

    let cancelled = false;

    async function loadModelAndCreateDetector() {
      setStatus("loading-model");
      try {
        // モデルファイルをバイナリとして取得
        const response = await fetch(MODEL_URL);
        if (!response.ok) {
          throw new Error(
            `モデルファイルの取得に失敗しました: ${response.status}`,
          );
        }
        const buffer = await response.arrayBuffer();
        const modelData = new Uint8Array(buffer);

        if (cancelled) return;

        // OpenCV.js の仮想ファイルシステムに書き込む
        // (既に同名ファイルが存在する場合はエラーになるため、事前に削除を試みる)
        try {
          cv.FS_unlink(MODEL_FS_PATH);
        } catch {
          // ファイルが存在しない場合のエラーは無視
        }
        cv.FS_createDataFile("/", MODEL_FS_PATH, modelData, true, false, false);

        // FaceDetectorYN インスタンスを生成
        const faceDetector = new cv.FaceDetectorYN(
          MODEL_FS_PATH,
          "",
          new cv.Size(INPUT_WIDTH, INPUT_HEIGHT),
          SCORE_THRESHOLD,
          NMS_THRESHOLD,
          TOP_K,
        );

        if (cancelled) {
          faceDetector.delete();
          return;
        }

        setDetector(faceDetector);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }

    loadModelAndCreateDetector();

    return () => {
      cancelled = true;
    };
  }, [cv]);

  return { detector, status, error };
}
