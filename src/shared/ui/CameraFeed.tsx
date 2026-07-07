import type { RefObject } from "react";
import type { CameraStatus } from "../hooks/useCamera";
import type { FaceMediaElement, FaceMediaKind } from "@/features/face-auth/FaceAuthContext";

interface CameraFeedProps {
  mediaRef: RefObject<FaceMediaElement | null>;
  mediaKind: FaceMediaKind;
  status: CameraStatus;
  error: string | null;
}

const FEED_CLASSES = "h-full w-full -scale-x-100 object-cover";

export function CameraFeed({ mediaRef, mediaKind, status, error }: CameraFeedProps) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-3xl bg-slate-950">
      {mediaKind === "video" ? (
        <video
          ref={mediaRef as RefObject<HTMLVideoElement | null>}
          autoPlay
          playsInline
          muted
          className={FEED_CLASSES}
        />
      ) : (
        <img ref={mediaRef as RefObject<HTMLImageElement | null>} alt="" className={FEED_CLASSES} />
      )}
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
