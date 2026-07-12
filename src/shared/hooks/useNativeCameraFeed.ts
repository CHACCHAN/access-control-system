import { useEffect, useRef, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CameraStatus } from "./useCamera";

interface CameraFramePayload {
  imageData: string;
}

interface UseNativeCameraFeedResult {
  /** 表示バッファA(互換のため mediaRef としても使う) */
  imgRef: RefObject<HTMLImageElement | null>;
  /** 表示バッファB(ダブルバッファの裏面) */
  imgBufferRef: RefObject<HTMLImageElement | null>;
  status: CameraStatus;
  error: string | null;
}

/**
 * WebKitGTK 経由の getUserMedia() がこのキオスク環境(PipeWire 未整備)では
 * 機能しないため、Rust 側が v4l2 から直接取得したフレームを `camera-frame`
 * イベントで受け取り、<img> に反映するフック。
 *
 * ちらつき対策として <img> 2枚のダブルバッファで表示する:
 * 新しいフレームは常に「裏」の img へ読み込み、decode() の完了(描画準備済み)を
 * 待ってから表裏の不透明度を入れ替える。表示中の img の src を直接差し替えると
 * デコードが終わるまでの間に空白が見えて点滅するため、旧フレームを見せ続けたまま
 * 切り替えるのが目的。
 *
 * 検出処理(呼び出し側)がフレーム到着ペースより遅くても古いフレームが
 * 溜まらないよう、常に「最後に届いたフレームだけ」を適用する。
 */
export function useNativeCameraFeed(): UseNativeCameraFeedResult {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgBufferRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const latestFrameRef = useRef<string | null>(null);
  const appliedFrameRef = useRef<string | null>(null);
  const applyingRef = useRef(false);
  const streamingRef = useRef(false);
  /** バッファA(imgRef)が現在「表」かどうか */
  const frontIsARef = useRef(true);

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
          const imgA = imgRef.current;
          const imgB = imgBufferRef.current;
          if (!frame || !imgA || !imgB || frame === appliedFrameRef.current) break;

          const front = frontIsARef.current ? imgA : imgB;
          const back = frontIsARef.current ? imgB : imgA;

          back.src = `data:image/jpeg;base64,${frame}`;
          try {
            await back.decode();
          } catch {
            break;
          }
          // 描画準備が完了してから表裏を入れ替える(旧フレームはそれまで表示され続ける)
          back.style.opacity = "1";
          front.style.opacity = "0";
          frontIsARef.current = !frontIsARef.current;
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

  return { imgRef, imgBufferRef, status, error };
}
