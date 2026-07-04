import { useEffect, useState } from "react";
import * as faceapi from "@vladmandic/face-api";

type FaceApiModelsStatus = "loading" | "ready" | "error";

interface UseFaceApiModelsResult {
  status: FaceApiModelsStatus;
  error: string | null;
}

const MODEL_URL = "/models";

/**
 * face-api.js の各モデル(顔検出・ランドマーク・特徴抽出)をロードするフック
 */
export function useFaceApiModels(): UseFaceApiModelsResult {
  const [status, setStatus] = useState<FaceApiModelsStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        if (cancelled) return;
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }

    loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  return { status, error };
}
