import { useEffect, useRef, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CameraStatus } from "./useCamera";

interface CameraFramePayload {
  imageData: string;
}

interface UseNativeCameraFeedResult {
  imgRef: RefObject<HTMLImageElement | null>;
  status: CameraStatus;
  error: string | null;
}

/**
 * WebKitGTK 経由の getUserMedia() がこのキオスク環境(PipeWire 未整備)では
 * 機能しないため、Rust 側が v4l2 から直接取得したフレームを `camera-frame`
 * イベントで受け取り、<img> に反映するフック。
 *
 * 検出処理(呼び出し側)がフレーム到着ペースより遅くても古いフレームが
 * 溜まらないよう、常に「最後に届いたフレームだけ」を適用する。
 */
export function useNativeCameraFeed(): UseNativeCameraFeedResult {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const latestFrameRef = useRef<string | null>(null);
  const appliedFrameRef = useRef<string | null>(null);
  const applyingRef = useRef(false);
  const streamingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unlistenFrame: UnlistenFn | undefined;
    let unlistenError: UnlistenFn | undefined;

    async function applyLatestFrame() {
      if (applyingRef.current) return;
      applyingRef.current = true;
      try {
        // デコード中に次のフレームが届いても、ここでは追わずに最新値だけ
        // 見るループにすることで、古いフレームの適用を自然に読み飛ばす。
        while (!cancelled) {
          const frame = latestFrameRef.current;
          const img = imgRef.current;
          if (!frame || !img || frame === appliedFrameRef.current) break;

          img.src = `data:image/jpeg;base64,${frame}`;
          try {
            await img.decode();
          } catch {
            break;
          }
          appliedFrameRef.current = frame;
          if (!streamingRef.current) {
            streamingRef.current = true;
            setStatus("streaming");
          }
        }
      } finally {
        applyingRef.current = false;
      }
    }

    async function start() {
      setStatus("requesting");
      try {
        unlistenFrame = await listen<CameraFramePayload>("camera-frame", (event) => {
          latestFrameRef.current = event.payload.imageData;
          void applyLatestFrame();
        });
        unlistenError = await listen<string>("camera-error", (event) => {
          if (cancelled) return;
          setError(event.payload);
          setStatus("error");
        });
        await invoke("start_camera_capture");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }

    start();

    return () => {
      cancelled = true;
      unlistenFrame?.();
      unlistenError?.();
      invoke("stop_camera_capture").catch(() => {});
    };
  }, []);

  return { imgRef, status, error };
}
