import type { RefObject } from "react";

interface FaceDetectionOverlayProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * カメラ映像の上に重ねて、検出した顔の枠・ランドマーク・信頼度スコアを
 * 描画するための canvas。実際の描画は useFaceRecognitionLoop が行い、
 * 映像の object-cover と同じ座標変換もそちらで済ませているため、
 * ここでは映像と同じ左右反転だけを合わせる(object-cover は付けない)。
 */
export function FaceDetectionOverlay({ canvasRef }: FaceDetectionOverlayProps) {
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
    />
  );
}
