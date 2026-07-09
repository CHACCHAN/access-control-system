import { useState } from "react";
import { useMembers } from "@/entities/member/MemberContext";
import { useFaceAuth } from "@/features/face-auth/FaceAuthContext";
import { CameraFeed } from "@/shared/ui/CameraFeed";
import { ThemeToggleButton } from "@/shared/ui/ThemeToggleButton";
import { FaceDetectionOverlay } from "@/features/face-auth/FaceDetectionOverlay";
import { FaceMatchConfirmCard } from "@/features/face-auth/FaceMatchConfirmCard";
import { FaceRegistrationOverlay } from "@/features/face-auth/FaceRegistrationOverlay";
import {
  useFaceRecognitionLoop,
  type FaceScanHint,
} from "@/features/face-auth/useFaceRecognitionLoop";
import { GearIcon, ScanFaceIcon } from "@/shared/ui/icons";

const HINT_TEXT: Record<Exclude<FaceScanHint, null>, string> = {
  scanning: "顔を画面に近づけてください",
  "come-closer": "もう少し近づいてください",
  "no-match": "登録済みの顔と一致しませんでした",
  "no-enrolled": "登録済みの顔がありません。まず顔登録を行ってください",
};

interface FaceAuthPanelProps {
  onOpenSettings: () => void;
}

export function FaceAuthPanel({ onOpenSettings }: FaceAuthPanelProps) {
  const { members, activeMember, selectMember } = useMembers();
  const { mediaRef, mediaKind, cameraStatus, cameraError, visionReady, enrolledFaces } =
    useFaceAuth();
  const [mode, setMode] = useState<"recognize" | "register">("recognize");
  const isPaused = activeMember !== null;

  const { overlayCanvasRef, hint, isInferring, matchedMember, dismissMatch } =
    useFaceRecognitionLoop({
      members,
      enrolledFaces,
      active:
        mode === "recognize" &&
        !isPaused &&
        visionReady &&
        cameraStatus === "streaming",
    });

  function handleConfirmMatch() {
    if (!matchedMember) return;
    const member = matchedMember;
    dismissMatch();
    selectMember(member);
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 bg-linear-to-t from-indigo-100 via-white to-slate-50 p-6 dark:from-indigo-950 dark:via-indigo-950 dark:to-slate-950">
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
          <ThemeToggleButton />
          <button
            onClick={onOpenSettings}
            aria-label="設定を開く"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-200 dark:shadow-none dark:hover:bg-slate-700"
          >
            <GearIcon className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden rounded-3xl bg-slate-900 shadow-inner shadow-black/40">
        <CameraFeed
          mediaRef={mediaRef}
          mediaKind={mediaKind}
          status={cameraStatus}
          error={cameraError}
        />

        <FaceDetectionOverlay canvasRef={overlayCanvasRef} />

        {mode === "recognize" && !matchedMember && !isPaused && (
          <div className="pointer-events-none absolute inset-6 rounded-2xl animate-pulse-ring" />
        )}

        {mode === "recognize" && isInferring && !matchedMember && (
          <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full bg-slate-950/70 px-3 py-1.5 text-xs text-slate-200 backdrop-blur">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            推論中
          </div>
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
          <FaceRegistrationOverlay onClose={() => setMode("recognize")} />
        )}
      </div>
    </section>
  );
}
