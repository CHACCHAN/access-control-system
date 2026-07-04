import type { RefObject } from "react";

interface FaceDetectionOverlayProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * カメラ映像の上に重ねて、検出した顔の枠・ランドマーク・信頼度スコアを
 * 描画するための canvas。実際の描画は useFaceRecognitionLoop が行う。
 */
export function FaceDetectionOverlay({ canvasRef }: FaceDetectionOverlayProps) {
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover"
    />
  );
}
