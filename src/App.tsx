import { CameraView } from "./components/CameraView";
import { FaceDetectorTest } from "./components/FaceDetectorTest";
import { useCamera } from "./hooks/useCamera";
import { useOpenCv } from "./hooks/useOpenCV";
import { useFaceDetector } from "./hooks/useFaceDetector";
import "./App.css";

function App() {
  const { videoRef, status: cameraStatus, error: cameraError } = useCamera();
  const { cv, status: cvStatus, error: cvError } = useOpenCv();
  const {
    detector,
    status: detectorStatus,
    error: detectorError,
  } = useFaceDetector(cv);

  return (
    <main className="container">
      <h1>在室管理システム - カメラ動作確認</h1>
      <p>OpenCV.js status: {cvStatus}</p>
      {cvError && <p style={{ color: "red" }}>{cvError}</p>}
      <p>FaceDetector status: {detectorStatus}</p>
      {detectorError && <p style={{ color: "red" }}>{detectorError}</p>}

      <div style={{ position: "relative", width: "640px", height: "480px" }}>
        <CameraView
          videoRef={videoRef}
          status={cameraStatus}
          error={cameraError}
        />
        {cv && detector && (
          <FaceDetectorTest cv={cv} detector={detector} videoRef={videoRef} />
        )}
      </div>
    </main>
  );
}

export default App;
