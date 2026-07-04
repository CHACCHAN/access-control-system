import type { RefObject } from "react";
import type { CameraStatus } from "../hooks/useCamera";

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
}

export function CameraView({ videoRef, status, error }: CameraViewProps) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-3xl bg-slate-950">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full -scale-x-100 object-cover"
      />
      {status === "requesting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-sm text-slate-300">
          <p className="animate-pulse">カメラへのアクセスを許可してください...</p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 px-6 text-center text-sm text-rose-400">
          <p>カメラの起動に失敗しました: {error}</p>
        </div>
      )}
    </div>
  );
}
