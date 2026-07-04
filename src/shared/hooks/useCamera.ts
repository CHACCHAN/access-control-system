import { useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "requesting" | "streaming" | "error";

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
}

/**
 * getUserMedia でカメラ映像を取得し、渡された <video> 要素にアタッチするフック。
 * コンポーネントの unmount 時にはストリームを確実に停止する。
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function startCamera() {
      setStatus("requesting");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });

        if (cancelled) {
          // コンポーネントが既に unmount されていたら即座に停止する
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus("streaming");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { videoRef, status, error };
}
