import { useEffect, useRef, useState, type RefObject } from "react";
import * as faceapi from "@vladmandic/face-api";
import type { Member } from "../api/members";
import type { EnrolledFace } from "../hooks/useEnrolledFaces";
import type { CameraStatus } from "../hooks/useCamera";
import { CameraView } from "./CameraView";
import { RegisterFaceView } from "./RegisterFaceView";
import { ScanFaceIcon } from "./icons";

interface RightSideContentProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceApiReady: boolean;
  members: Member[];
  enrolledFaces: EnrolledFace[];
  onEnroll: (username: string, descriptor: Float32Array) => void;
  onSelectMember: (member: Member) => void;
  isPaused: boolean;
}

const MATCH_THRESHOLD = 0.6;
const CLOSE_THRESHOLD = 0.32;
const DETECTION_INTERVAL_MS = 800;

type Hint = "scanning" | "come-closer" | "no-match" | "no-enrolled" | null;

const HINT_TEXT: Record<Exclude<Hint, null>, string> = {
  scanning: "顔を画面に近づけてください",
  "come-closer": "もう少し近づいてください",
  "no-match": "登録済みの顔と一致しませんでした",
  "no-enrolled": "登録済みの顔がありません。まず顔登録を行ってください",
};

export function RightSideContent({
  videoRef,
  cameraStatus,
  cameraError,
  faceApiReady,
  members,
  enrolledFaces,
  onEnroll,
  onSelectMember,
  isPaused,
}: RightSideContentProps) {
  const [mode, setMode] = useState<"recognize" | "register">("recognize");
  const [confirmingMember, setConfirmingMember] = useState<Member | null>(null);
  const [hint, setHint] = useState<Hint>("scanning");
  const isCheckingRef = useRef(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const isScanningActive =
    mode === "recognize" &&
    !isPaused &&
    !confirmingMember &&
    faceApiReady &&
    cameraStatus === "streaming";

  function drawOverlay(detection: faceapi.WithFaceLandmarks<faceapi.WithFaceDetection<object>> | null) {
    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    if (!video || !canvas) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
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
    ctx.fillStyle = "#0f172a";
    ctx.fillText(label, x + 5, labelY + 13);
  }

  useEffect(() => {
    if (!isScanningActive) {
      drawOverlay(null);
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

        drawOverlay(detection ?? null);

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
          const distance = faceapi.euclideanDistance(detection.descriptor, face.descriptor);
          if (!best || distance < best.distance) {
            best = { username: face.username, distance };
          }
        }

        if (best && best.distance <= MATCH_THRESHOLD) {
          const member = members.find((m) => m.username === best!.username);
          if (member) {
            setConfirmingMember(member);
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
  }, [isScanningActive, enrolledFaces, members, videoRef]);

  return (
    <section className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">顔認証</h2>
          <p className="text-sm text-slate-400">カメラに顔を近づけると自動で認識します</p>
        </div>
        <button
          onClick={() => setMode(mode === "register" ? "recognize" : "register")}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
        >
          <ScanFaceIcon className="h-4 w-4 text-sky-400" />
          {mode === "register" ? "認証に戻る" : "顔を登録する"}
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden rounded-3xl bg-slate-900 shadow-inner shadow-black/40">
        <CameraView videoRef={videoRef} status={cameraStatus} error={cameraError} />

        <canvas
          ref={overlayCanvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover"
        />

        {mode === "recognize" && isScanningActive && (
          <div className="pointer-events-none absolute inset-6 rounded-2xl animate-pulse-ring" />
        )}

        {mode === "recognize" && hint && !confirmingMember && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
            <p className="animate-fade-in rounded-full bg-slate-950/80 px-4 py-2 text-sm text-slate-200 shadow-lg backdrop-blur">
              {HINT_TEXT[hint]}
            </p>
          </div>
        )}

        {mode === "recognize" && confirmingMember && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center p-6">
            <div className="w-full max-w-sm animate-slide-up rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-center shadow-2xl backdrop-blur">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-sky-500 text-xl font-semibold text-white">
                {confirmingMember.name.slice(0, 1)}
              </div>
              <p className="mt-3 text-base font-semibold text-white">
                {confirmingMember.name} さんですか？
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setConfirmingMember(null)}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5"
                >
                  ちがう
                </button>
                <button
                  onClick={() => {
                    const member = confirmingMember;
                    setConfirmingMember(null);
                    onSelectMember(member);
                  }}
                  className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
                >
                  はい
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "register" && (
          <RegisterFaceView
            videoRef={videoRef}
            members={members}
            faceApiReady={faceApiReady}
            onRegistered={onEnroll}
            onClose={() => setMode("recognize")}
          />
        )}
      </div>
    </section>
  );
}
