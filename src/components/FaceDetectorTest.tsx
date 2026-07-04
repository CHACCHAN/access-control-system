import { useRef } from "react";

interface FaceDetectionResult {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

interface FaceDetectorTestProps {
  cv: any;
  detector: any;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const DETECTOR_INPUT_SIZE = 320;

export function FaceDetectorTest({
  cv,
  detector,
  videoRef,
}: FaceDetectorTestProps) {
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);

  function runDetection() {
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!video || !overlayCanvas || !cv || !detector) return;

    // video の現在のフレームを、作業用 canvas に等倍で描画してから cv.Mat 化する
    const workCanvas =
      workCanvasRef.current ?? document.createElement("canvas");
    workCanvasRef.current = workCanvas;
    workCanvas.width = video.videoWidth;
    workCanvas.height = video.videoHeight;
    const workCtx = workCanvas.getContext("2d", { willReadFrequently: true });
    if (!workCtx) return;
    workCtx.drawImage(video, 0, 0, workCanvas.width, workCanvas.height);

    // cv.Mat 群はすべて明示的に delete() してヒープを解放する必要がある
    const srcMat = cv.imread(workCanvas);
    const resizedMat = new cv.Mat();

    try {
      cv.resize(
        srcMat,
        resizedMat,
        new cv.Size(DETECTOR_INPUT_SIZE, DETECTOR_INPUT_SIZE),
      );

      const facesMat = new cv.Mat();
      try {
        detector.detect(resizedMat, facesMat);

        // facesMat は N行15列の行列。1行が1つの顔に対応し、
        // 列0-3: x, y, width, height (バウンディングボックス)
        // 列4-13: 5点のランドマーク(x, y のペア)
        // 列14: 検出スコア
        const results: FaceDetectionResult[] = [];
        const scaleX = workCanvas.width / DETECTOR_INPUT_SIZE;
        const scaleY = workCanvas.height / DETECTOR_INPUT_SIZE;

        for (let i = 0; i < facesMat.rows; i++) {
          const x = facesMat.data32F[i * 15 + 0] * scaleX;
          const y = facesMat.data32F[i * 15 + 1] * scaleY;
          const width = facesMat.data32F[i * 15 + 2] * scaleX;
          const height = facesMat.data32F[i * 15 + 3] * scaleY;
          const score = facesMat.data32F[i * 15 + 14];
          results.push({ x, y, width, height, score });
        }

        drawResults(
          results,
          overlayCanvas,
          video.videoWidth,
          video.videoHeight,
        );
      } finally {
        facesMat.delete();
      }
    } finally {
      srcMat.delete();
      resizedMat.delete();
    }
  }

  function drawResults(
    results: FaceDetectionResult[],
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
  ) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#00ff00";

    for (const face of results) {
      ctx.strokeRect(face.x, face.y, face.width, face.height);
      ctx.fillText(
        `score: ${face.score.toFixed(2)}`,
        face.x,
        face.y > 20 ? face.y - 5 : face.y + face.height + 15,
      );
    }
  }

  return (
    <>
      <canvas
        ref={overlayCanvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "640px",
          height: "480px",
          transform: "scaleX(-1)", // CameraView側の鏡像表示と揃える
          pointerEvents: "none",
        }}
      />
      <button
        onClick={runDetection}
        style={{ position: "absolute", bottom: "-40px", left: 0 }}
      >
        検出を実行
      </button>
    </>
  );
}
