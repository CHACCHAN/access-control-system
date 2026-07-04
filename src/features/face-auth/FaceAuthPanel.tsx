import { useState, type RefObject } from "react";
import type { Member } from "../../entities/member/api";
import type { EnrolledFace } from "./useEnrolledFaces";
import type { CameraStatus } from "../../shared/hooks/useCamera";
import type { Theme } from "../../shared/hooks/useTheme";
import { CameraFeed } from "../../shared/ui/CameraFeed";
import { ThemeToggleButton } from "../../shared/ui/ThemeToggleButton";
import { FaceDetectionOverlay } from "./FaceDetectionOverlay";
import { FaceMatchConfirmCard } from "./FaceMatchConfirmCard";
import { FaceRegistrationOverlay } from "./FaceRegistrationOverlay";
import {
  useFaceRecognitionLoop,
  type FaceScanHint,
} from "./useFaceRecognitionLoop";
import { ScanFaceIcon } from "../../shared/ui/icons";

interface FaceAuthPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceApiReady: boolean;
  members: Member[];
  enrolledFaces: EnrolledFace[];
  onEnroll: (username: string, descriptor: Float32Array) => void;
  onSelectMember: (member: Member) => void;
  isPaused: boolean;
  theme: Theme;
  onToggleTheme: () => void;
}

const HINT_TEXT: Record<Exclude<FaceScanHint, null>, string> = {
  scanning: "顔を画面に近づけてください",
  "come-closer": "もう少し近づいてください",
  "no-match": "登録済みの顔と一致しませんでした",
  "no-enrolled": "登録済みの顔がありません。まず顔登録を行ってください",
};

export function FaceAuthPanel({
  videoRef,
  cameraStatus,
  cameraError,
  faceApiReady,
  members,
  enrolledFaces,
  onEnroll,
  onSelectMember,
  isPaused,
  theme,
  onToggleTheme,
}: FaceAuthPanelProps) {
  const [mode, setMode] = useState<"recognize" | "register">("recognize");

  const { overlayCanvasRef, hint, matchedMember, dismissMatch } =
    useFaceRecognitionLoop({
      videoRef,
      members,
      enrolledFaces,
      active:
        mode === "recognize" &&
        !isPaused &&
        faceApiReady &&
        cameraStatus === "streaming",
    });

  function handleConfirmMatch() {
    if (!matchedMember) return;
    const member = matchedMember;
    dismissMatch();
    onSelectMember(member);
  }

  return (
    <section className="flex h-full flex-col gap-4 bg-linear-to-t from-indigo-100 via-white to-slate-50 p-6 dark:from-indigo-950 dark:via-indigo-950 dark:to-slate-950">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            顔認証
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            カメラに顔を近づけると自動で認識します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setMode(mode === "register" ? "recognize" : "register")
            }
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-200 dark:shadow-none dark:hover:bg-slate-700"
          >
            <ScanFaceIcon className="h-4 w-4 text-sky-400" />
            {mode === "register" ? "認証に戻る" : "顔を登録する"}
          </button>
          <ThemeToggleButton theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden rounded-3xl bg-slate-900 shadow-inner shadow-black/40">
        <CameraFeed
          videoRef={videoRef}
          status={cameraStatus}
          error={cameraError}
        />

        <FaceDetectionOverlay canvasRef={overlayCanvasRef} />

        {mode === "recognize" && !matchedMember && !isPaused && (
          <div className="pointer-events-none absolute inset-6 rounded-2xl animate-pulse-ring" />
        )}

        {mode === "recognize" && hint && !matchedMember && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
            <p className="animate-fade-in rounded-full bg-white/90 px-4 py-2 text-sm text-slate-700 shadow-lg backdrop-blur dark:bg-slate-950/80 dark:text-slate-200">
              {HINT_TEXT[hint]}
            </p>
          </div>
        )}

        {mode === "recognize" && matchedMember && (
          <FaceMatchConfirmCard
            member={matchedMember}
            onConfirm={handleConfirmMatch}
            onReject={dismissMatch}
          />
        )}

        {mode === "register" && (
          <FaceRegistrationOverlay
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
