import { useEffect, useRef, useState } from "react";
import { withTimeout } from "@/shared/lib/withTimeout";

export type CameraStatus = "idle" | "requesting" | "streaming" | "error";

// WebKitGTK では権限リクエストが取りこぼされると getUserMedia() が
// resolve/reject されずに無限に待ち続けることがあるため、上限時間を設ける。
const GET_USER_MEDIA_TIMEOUT_MS = 5000;

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
}

/**
 * getUserMedia でカメラ映像を取得し、渡された <video> 要素にアタッチするフック。
 * コンポーネントの unmount 時にはストリームを確実に停止する。
 *
 * 呼び出し側のコンポーネントは、実際に `<video ref={videoRef}>` を
 * マウントするタイミングになってから初めてこのフックを使うこと(= マウントが
 * 起動トリガーを兼ねる)。取得したストリームは `videoRef.current` に直接代入する
 * だけで React 管理下にないため、video 要素がまだ無い状態で開始すると、映像取得
 * 自体は成功していても(status は "streaming" になるが)画面には何も表示されない。
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
        const getUserMediaPromise = navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });
        // タイムアウトで先に諦めた後にストリームが届いても掴みっぱなしにしない
        getUserMediaPromise.then(
          (lateStream) => {
            if (stream !== lateStream) lateStream.getTracks().forEach((track) => track.stop());
          },
          () => {},
        );

        stream = await withTimeout(
          getUserMediaPromise,
          GET_USER_MEDIA_TIMEOUT_MS,
          "カメラへのアクセス要求がタイムアウトしました",
        );

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
