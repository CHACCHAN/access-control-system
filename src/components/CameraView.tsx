import type { RefObject } from "react";
import type { CameraStatus } from "../hooks/useCamera";

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
}

export function CameraView({ videoRef, status, error }: CameraViewProps) {
  return (
    <div style={{ position: "relative", width: "640px", height: "480px" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "640px",
          height: "480px",
          backgroundColor: "#000",
          transform: "scaleX(-1)", // 鏡像表示(セルフィー慣れした見た目にする)
        }}
      />
      {status === "requesting" && (
        <p>カメラへのアクセスを許可してください...</p>
      )}
      {status === "error" && (
        <p style={{ color: "red" }}>カメラの起動に失敗しました: {error}</p>
      )}
    </div>
  );
}
