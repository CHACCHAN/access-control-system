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
    // 角丸はここでは付けない。丸めるのは配置先の親(overflow-hidden + rounded)の
    // 責務で、ここで別の半径を付けると四隅で映像が余計に削られて枠とズレる。
    <div className="absolute inset-0 overflow-hidden bg-slate-950">
      {mediaKind === "video" ? (
        <video
          ref={mediaRef as RefObject<HTMLVideoElement | null>}
          autoPlay
          playsInline
          muted
          className={FEED_CLASSES}
        />
      ) : (
        // 実機: Rust から Channel で届くバイナリ JPEG を useNativeCameraFeed が
        // デコード完了後に一括で描画する(canvas なので中間状態の点滅が無い)
        <canvas
          ref={mediaRef as RefObject<HTMLCanvasElement | null>}
          className={FEED_CLASSES}
        />
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
      {status === "unavailable" && (
        // 異常ではない(実カメラが無いだけ)ので、赤いエラーにはせず中立的に案内する。
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-950/90 px-6 text-center text-slate-400">
          <p className="text-sm">カメラ映像なし</p>
          {error && <p className="text-xs text-slate-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
