import { useEffect, useRef, useState, type RefObject } from "react";
import * as faceapi from "@vladmandic/face-api";
import type { Member } from "../../entities/member/api";
import type { EnrolledFace } from "./useEnrolledFaces";

const MATCH_THRESHOLD = 0.6;
const CLOSE_THRESHOLD = 0.32;
const DETECTION_INTERVAL_MS = 800;

export type FaceScanHint =
  | "scanning"
  | "come-closer"
  | "no-match"
  | "no-enrolled"
  | null;

interface UseFaceRecognitionLoopParams {
  videoRef: RefObject<HTMLVideoElement | null>;
  members: Member[];
  enrolledFaces: EnrolledFace[];
  active: boolean;
}

interface UseFaceRecognitionLoopResult {
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  hint: FaceScanHint;
  matchedMember: Member | null;
  dismissMatch: () => void;
}

type FaceDetection = faceapi.WithFaceLandmarks<
  faceapi.WithFaceDetection<object>
>;

function drawDetectionOverlay(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
  detection: FaceDetection | null,
) {
  if (!video || !canvas) return;

  if (
    canvas.width !== video.videoWidth ||
    canvas.height !== video.videoHeight
  ) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!detection) return;

  const { x, y, width, height } = detection.detection.box;

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = "rgba(125, 211, 252, 0.9)";
  for (const point of detection.landmarks.positions) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const label = detection.detection.score.toFixed(2);
  ctx.font = "600 13px system-ui, sans-serif";
  const labelWidth = ctx.measureText(label).width + 10;
  const labelY = Math.max(y - 20, 0);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(x, labelY, labelWidth, 18);
  ctx.save();
  ctx.translate(x + 5, labelY + 13);
  ctx.scale(-1, 1);
  ctx.textAlign = "right";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/**
 * カメラ映像から一定間隔で顔を検出し、登録済みの顔特徴ベクトルと照合するフック。
 * 一致したメンバーが見つかると matchedMember をセットしてスキャンを一時停止する。
 */
export function useFaceRecognitionLoop({
  videoRef,
  members,
  enrolledFaces,
  active,
}: UseFaceRecognitionLoopParams): UseFaceRecognitionLoopResult {
  const [hint, setHint] = useState<FaceScanHint>("scanning");
  const [matchedMember, setMatchedMember] = useState<Member | null>(null);
  const isCheckingRef = useRef(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const isScanning = active && !matchedMember;

  useEffect(() => {
    if (!isScanning) {
      drawDetectionOverlay(videoRef.current, overlayCanvasRef.current, null);
      return;
    }

    const timer = window.setInterval(async () => {
      if (isCheckingRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      isCheckingRef.current = true;
      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();

        drawDetectionOverlay(
          video,
          overlayCanvasRef.current,
          detection ?? null,
        );

        if (!detection) {
          setHint("scanning");
          return;
        }

        const closeness = detection.detection.box.width / video.videoWidth;
        if (closeness < CLOSE_THRESHOLD) {
          setHint("come-closer");
          return;
        }

        if (enrolledFaces.length === 0) {
          setHint("no-enrolled");
          return;
        }

        let best: { username: string; distance: number } | null = null;
        for (const face of enrolledFaces) {
          const distance = faceapi.euclideanDistance(
            detection.descriptor,
            face.descriptor,
          );
          if (!best || distance < best.distance) {
            best = { username: face.username, distance };
          }
        }

        if (best && best.distance <= MATCH_THRESHOLD) {
          const member = members.find((m) => m.username === best!.username);
          if (member) {
            setMatchedMember(member);
            setHint(null);
            return;
          }
        }

        setHint("no-match");
      } finally {
        isCheckingRef.current = false;
      }
    }, DETECTION_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isScanning, enrolledFaces, members, videoRef]);

  function dismissMatch() {
    setMatchedMember(null);
  }

  return { overlayCanvasRef, hint, matchedMember, dismissMatch };
}
