import { useEffect, useState } from "react";
import * as faceapi from "@vladmandic/face-api";

type FaceApiModelsStatus = "loading" | "ready" | "error";

interface UseFaceApiModelsResult {
  status: FaceApiModelsStatus;
  error: string | null;
}

const MODEL_URL = "/models";

let modelsPromise: Promise<void> | null = null;

/**
 * face-api.js の各モデル(顔検出・ランドマーク・特徴抽出)をロードする。
 * 複数箇所から呼ばれても実際のロードは一度だけ行われる(結果を使い回す)。
 */
export function loadFaceApiModels(): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => {
      // webgl以外(wasm/cpu)にフォールバックしていると検出が大幅に遅くなるため、
      // 実機での性能調査用にどのバックエンドが使われているかログに残す。
      // @vladmandic/face-api の型定義には tf.getBackend() が含まれていないが、
      // 実行時には tfjs-core のAPIがそのまま faceapi.tf として提供されている。
      const tf = faceapi.tf as unknown as { getBackend(): string };
      console.log(`[face-api] tfjs backend: ${tf.getBackend()}`);
    });
  }
  return modelsPromise;
}

/**
 * face-api.js のモデルロード状況を React state として扱うフック
 */
export function useFaceApiModels(): UseFaceApiModelsResult {
  const [status, setStatus] = useState<FaceApiModelsStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadFaceApiModels()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { status, error };
}
