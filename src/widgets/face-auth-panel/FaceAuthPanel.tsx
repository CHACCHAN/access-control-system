import { useEffect, useRef, useState } from "react";
import type { AttendanceStatus } from "@/entities/member/api";
import { useMembers } from "@/entities/member/MemberContext";
import { useFaceAuth } from "@/features/face-auth/FaceAuthContext";
import { CameraFeed } from "@/shared/ui/CameraFeed";
import { ThemeToggleButton } from "@/shared/ui/ThemeToggleButton";
import { FaceMatchConfirmCard } from "@/features/face-auth/FaceMatchConfirmCard";
import {
  useFaceRecognitionLoop,
  type FaceScanHint,
} from "@/features/face-auth/useFaceRecognitionLoop";
import { useGestureStatusLoop } from "@/features/gesture/useGestureStatusLoop";
import { postAttendance } from "@/widgets/attendance-action-sheet/api";
import { playUiSound } from "@/shared/lib/uiSound";
import { ArrowUpIcon, GearIcon, ScanFaceIcon } from "@/shared/ui/icons";
import { isAnimatedPattern, PATTERN_CLASS, useSettings } from "@/shared/hooks/useSettings";
import type { AuthMode } from "@/app/App";

const HINT_TEXT: Record<Exclude<FaceScanHint, null>, string> = {
  scanning: "顔を画面に近づけてください",
  "come-closer": "もう少し近づいてください",
  "no-match": "登録済みの顔と一致しませんでした",
  "no-enrolled": "登録済みの顔がありません。まず顔登録を行ってください",
};

interface FaceAuthPanelProps {
  onOpenSettings: () => void;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
}

export function FaceAuthPanel({ onOpenSettings, mode, setMode }: FaceAuthPanelProps) {
  const { settings } = useSettings();
  const customBg = settings.appearance.authPanelBg;
  // アニメーション付き背景(回路/信号)はこのパネルの背景にのみ描画する
  const pattern = settings.appearance.backgroundPattern;
  const animatedPatternClass = isAnimatedPattern(pattern) ? PATTERN_CLASS[pattern] : "";
  const { members, activeMember, selectMember, updateStatus } = useMembers();
  const {
    mediaRef,
    mediaBufferRef,
    mediaKind,
    cameraStatus,
    cameraError,
    visionReady,
    enrolledFaces,
  } = useFaceAuth();
  const isPaused = activeMember !== null;

  // 認識ループは登録中も動かし、Rust 側の検出可視化(枠・ランドマーク)を継続する。
  // ただし確定(確認カード表示)は認証モードのときだけ行う。
  const { hint, isInferring, matchedMember, dismissMatch } = useFaceRecognitionLoop({
    members,
    enrolledFaces,
    active: !isPaused && visionReady && cameraStatus === "streaming",
    enableMatch: mode === "recognize",
  });

  function handleConfirmMatch() {
    if (!matchedMember) return;
    const member = matchedMember;
    dismissMatch();
    selectMember(member);
  }

  const showConfirm = mode === "recognize" && matchedMember !== null;

  // 確認カード表示中のジェスチャー直接記録。「はい」を押さなくても、
  // ジェスチャーをかざせばそのまま割り当てステータスで記録できる。
  const [gestureCompleted, setGestureCompleted] = useState<AttendanceStatus | null>(null);
  const [gesturePosting, setGesturePosting] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);

  // 対象メンバーが変わったら完了表示・タイマーをリセットする
  useEffect(() => {
    setGestureCompleted(null);
    setGesturePosting(false);
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, [matchedMember?.username]);

  const { detectedGesture } = useGestureStatusLoop({
    active: showConfirm && !gestureCompleted && !gesturePosting,
    onStatus: (status) => void handleGestureStatus(status),
    // サムズダウン(設定 rejectGesture)で「ちがう」= 確認カードを閉じて認証へ戻る
    onReject: () => {
      playUiSound("click");
      dismissMatch();
    },
  });

  async function handleGestureStatus(status: AttendanceStatus) {
    if (!matchedMember || gesturePosting || gestureCompleted) return;
    if (status === matchedMember.status) return; // 現在と同じステータスは記録しない
    setGesturePosting(true);
    try {
      await postAttendance(
        matchedMember.username,
        matchedMember.name,
        status,
        settings.attendanceEndpoint,
        settings.apiToken,
        settings.attendanceBodyTemplate,
      );
      playUiSound("success");
      updateStatus(matchedMember.username, status);
      setGestureCompleted(status);
      dismissTimerRef.current = window.setTimeout(() => {
        setGestureCompleted(null);
        dismissMatch();
      }, 1300);
    } catch (err) {
      playUiSound("error");
      console.error("[face-auth] ジェスチャー記録に失敗:", err);
    } finally {
      setGesturePosting(false);
    }
  }

  return (
    <section
      // isolate: アニメーション背景(-z-10)をこのパネルの背景色より上・
      // コンテンツより下に挟むためのスタッキングコンテキスト
      className="relative isolate flex h-full min-h-0 flex-col gap-4 bg-linear-to-t from-cyan-50 via-white to-slate-50 p-6 dark:from-cyan-950/20 dark:via-transparent dark:to-transparent"
      // background ショートハンドで既定のグラデーションごと上書きする
      style={customBg ? { background: customBg } : undefined}
    >
      {/* アニメーション付き背景パターン(回路/信号)。トップ画面ではこのパネルにのみ描画する */}
      {animatedPatternClass && (
        <div
          className={`${animatedPatternClass} pointer-events-none absolute inset-0 -z-10 opacity-60`}
        />
      )}
      <header className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
            // face auth
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            顔認証
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            カメラに顔を近づけると自動で認識します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(mode === "register" ? "recognize" : "register")}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-cyan-400/50 hover:text-cyan-600 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:shadow-none dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
          >
            <ScanFaceIcon className="h-4 w-4 text-cyan-500 dark:text-cyan-400" />
            {mode === "register" ? "認証に戻る" : "顔を登録する"}
          </button>
          <ThemeToggleButton />
          <button
            onClick={onOpenSettings}
            aria-label="設定を開く"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-cyan-400/50 hover:text-cyan-600 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:shadow-none dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
          >
            <GearIcon className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      <div className="cyber-corners relative flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-inner shadow-black/40 dark:border-cyan-400/15">
        <CameraFeed
          mediaRef={mediaRef}
          mediaBufferRef={mediaBufferRef}
          mediaKind={mediaKind}
          status={cameraStatus}
          error={cameraError}
        />

        {mode === "recognize" && !matchedMember && !isPaused && (
          <div className="pointer-events-none absolute inset-6 rounded-2xl animate-pulse-ring" />
        )}

        {isInferring && !showConfirm && (
          <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-slate-950/70 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-cyan-300 backdrop-blur">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            inferring
          </div>
        )}

        {/* 登録中の案内。物理カメラはウィンドウ上端の中央にある想定なので、
            パネル内ではなくウィンドウ全体の上端中央へ固定して矢印を上に向ける。 */}
        {mode === "register" && (
          <div className="pointer-events-none fixed left-1/2 top-4 z-40 flex -translate-x-1/2 flex-col items-center gap-2 animate-fade-in">
            <ArrowUpIcon className="h-10 w-10 animate-bounce text-cyan-400" />
            <p className="rounded-lg border border-cyan-400/20 bg-slate-950/80 px-5 py-2 text-base font-semibold text-slate-100 shadow-lg backdrop-blur">
              カメラを見てください
            </p>
          </div>
        )}

        {mode === "recognize" && hint && !matchedMember && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
            <p className="animate-fade-in rounded-lg border border-slate-200/50 bg-white/90 px-4 py-2 text-sm text-slate-700 shadow-lg backdrop-blur dark:border-cyan-400/20 dark:bg-slate-950/80 dark:text-slate-200">
              {HINT_TEXT[hint]}
            </p>
          </div>
        )}

        {showConfirm && matchedMember && (
          <FaceMatchConfirmCard
            member={matchedMember}
            onConfirm={handleConfirmMatch}
            onReject={dismissMatch}
            detectedGesture={detectedGesture}
            completedAction={gestureCompleted}
          />
        )}
      </div>
    </section>
  );
}
