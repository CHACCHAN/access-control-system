import type { RefObject } from "react";
import type { CameraStatus } from "../hooks/useCamera";
import type { FaceMediaElement, FaceMediaKind } from "@/features/face-auth/FaceAuthContext";

interface CameraFeedProps {
  mediaRef: RefObject<FaceMediaElement | null>;
  /** 実機(img)のみ: ちらつき対策のダブルバッファ裏面 */
  mediaBufferRef?: RefObject<HTMLImageElement | null>;
  mediaKind: FaceMediaKind;
  status: CameraStatus;
  error: string | null;
}

const FEED_CLASSES = "h-full w-full -scale-x-100 object-cover";

export function CameraFeed({
  mediaRef,
  mediaBufferRef,
  mediaKind,
  status,
  error,
}: CameraFeedProps) {
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
        // ダブルバッファ: 2枚を重ね、useNativeCameraFeed がデコード完了後に
        // 不透明度を入れ替える(表示中の src を直接差し替えると点滅するため)
        <>
          <img
            ref={mediaRef as RefObject<HTMLImageElement | null>}
            alt=""
            className={`absolute inset-0 ${FEED_CLASSES}`}
          />
          {mediaBufferRef && (
            <img
              ref={mediaBufferRef}
              alt=""
              className={`absolute inset-0 opacity-0 ${FEED_CLASSES}`}
            />
          )}
        </>
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
