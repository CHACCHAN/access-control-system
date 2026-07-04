import { useRef, useState } from "react";
import * as faceapi from "@vladmandic/face-api";
import type { EnrolledStudent } from "../hooks/useEnrolledStudents";

interface FaceRecognitionTestProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  students: EnrolledStudent[];
  onEnroll: (studentNumber: string, descriptor: Float32Array) => void;
}

const MATCH_THRESHOLD = 0.6;

export function FaceRecognitionTest({
  videoRef,
  students,
  onEnroll,
}: FaceRecognitionTestProps) {
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [studentNumberInput, setStudentNumberInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function detectCurrentFace() {
    const video = videoRef.current;
    if (!video) return null;

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    return detection;
  }

  function drawDetection(detection: any) {
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!video || !overlayCanvas) return;

    overlayCanvas.width = video.videoWidth;
    overlayCanvas.height = video.videoHeight;
    const ctx = overlayCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (!detection) return;

    const resized = faceapi.resizeResults(detection, {
      width: video.videoWidth,
      height: video.videoHeight,
    });
    faceapi.draw.drawDetections(overlayCanvas, resized);
    faceapi.draw.drawFaceLandmarks(overlayCanvas, resized);
  }

  async function handleEnroll() {
    if (!studentNumberInput.trim()) {
      setStatusMessage("学籍番号を入力してください");
      return;
    }

    setIsProcessing(true);
    try {
      const detection = await detectCurrentFace();
      drawDetection(detection);

      if (!detection) {
        setStatusMessage("顔が検出されませんでした");
        return;
      }

      onEnroll(studentNumberInput.trim(), detection.descriptor);
      setStatusMessage(`登録しました: ${studentNumberInput.trim()}`);
    } catch (err) {
      console.error("enroll failed:", err);
      setStatusMessage(`登録エラー: ${String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleMatch() {
    setIsProcessing(true);
    try {
      const detection = await detectCurrentFace();
      drawDetection(detection);

      if (!detection) {
        setStatusMessage("顔が検出されませんでした");
        return;
      }

      if (students.length === 0) {
        setStatusMessage("登録済みの学生がいません");
        return;
      }

      let bestMatch: { studentNumber: string; distance: number } | null = null;
      for (const student of students) {
        const distance = faceapi.euclideanDistance(
          detection.descriptor,
          student.descriptor,
        );
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { studentNumber: student.studentNumber, distance };
        }
      }

      if (bestMatch && bestMatch.distance <= MATCH_THRESHOLD) {
        setStatusMessage(
          `あなたは ${bestMatch.studentNumber} さんですか？(距離: ${bestMatch.distance.toFixed(4)})`,
        );
      } else {
        setStatusMessage(
          `該当者なし(最も近い候補との距離: ${bestMatch?.distance.toFixed(4)}、閾値: ${MATCH_THRESHOLD})`,
        );
      }
    } catch (err) {
      console.error("match failed:", err);
      setStatusMessage(`照合エラー: ${String(err)}`);
    } finally {
      setIsProcessing(false);
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
          transform: "scaleX(-1)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-90px",
          left: 0,
          width: "640px",
        }}
      >
        <input
          type="text"
          placeholder="学籍番号"
          value={studentNumberInput}
          onChange={(e) => setStudentNumberInput(e.target.value)}
          style={{ marginRight: "8px" }}
        />
        <button onClick={handleEnroll} disabled={isProcessing}>
          登録
        </button>
        <button
          onClick={handleMatch}
          disabled={isProcessing}
          style={{ marginLeft: "8px" }}
        >
          照合
        </button>
        {statusMessage && <p>{statusMessage}</p>}
        <p style={{ fontSize: "0.85em", color: "#888" }}>
          登録済み: {students.map((s) => s.studentNumber).join(", ") || "なし"}
        </p>
      </div>
    </>
  );
}
