import { CameraView } from "./components/CameraView";
import { FaceRecognitionTest } from "./components/FaceRecognitionTest";
import { useCamera } from "./hooks/useCamera";
import { useFaceApi } from "./hooks/useFaceApi";
import { useEnrolledStudents } from "./hooks/useEnrolledStudents";
import "./App.css";

export default function App() {
  const { videoRef, status: cameraStatus, error: cameraError } = useCamera();
  const { status: faceApiStatus, error: faceApiError } = useFaceApi();
  const { students, enroll } = useEnrolledStudents();

  return (
    <main className="container">
      <h1>在室管理システム - カメラ動作確認</h1>
      <p>FaceAPI status: {faceApiStatus}</p>
      {faceApiError && <p style={{ color: "red" }}>{faceApiError}</p>}

      <div style={{ position: "relative", width: "640px", height: "480px" }}>
        <CameraView
          videoRef={videoRef}
          status={cameraStatus}
          error={cameraError}
        />
        {faceApiStatus === "ready" && (
          <FaceRecognitionTest
            videoRef={videoRef}
            students={students}
            onEnroll={enroll}
          />
        )}
      </div>
    </main>
  );
}
