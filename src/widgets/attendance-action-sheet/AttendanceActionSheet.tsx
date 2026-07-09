import { useEffect, useRef, useState } from "react";
import type { AttendanceStatus } from "@/entities/member/api";
import { useMembers } from "@/entities/member/MemberContext";
import { ATTENDANCE_STATUSES, STATUS_STYLE } from "@/entities/member/statusStyle";
import { useSettings } from "@/shared/hooks/useSettings";
import { detectGesture, type GestureKind } from "@/shared/lib/visionApi";
import { postAttendance } from "./api";
import { CheckIcon, CloseIcon } from "@/shared/ui/icons";

// ジェスチャー認識のポーリング間隔。このシート表示中は顔認証ループが
// 停止しているため、CPU(i7-3770想定)を取り合うことはない。
const GESTURE_POLL_INTERVAL_MS = 700;
// 誤爆防止: 同じジェスチャーがこの回数連続したときだけステータスを更新する
const GESTURE_STABLE_COUNT = 2;

const GESTURE_EMOJI: Record<Exclude<GestureKind, "Unknown">, string> = {
  Rock: "✊",
  Scissors: "✌️",
  Paper: "✋",
};

export function AttendanceActionSheet() {
  const { activeMember: member, clearSelection, updateStatus } = useMembers();
  const { settings } = useSettings();
  const [pendingAction, setPendingAction] = useState<AttendanceStatus | null>(null);
  const [completedAction, setCompletedAction] = useState<AttendanceStatus | null>(null);
  const [detectedGesture, setDetectedGesture] = useState<GestureKind | null>(null);

  // シートは選択メンバーが変わっても同一コンポーネントとして存在し続ける(null を
  // 返して非表示になるだけ)ため、前回の完了表示が次のメンバーに引き継がれないよう
  // 対象メンバーが変わるたびにローカル状態をリセットする
  useEffect(() => {
    setPendingAction(null);
    setCompletedAction(null);
    setDetectedGesture(null);
  }, [member?.username]);

  const busy = pendingAction !== null || completedAction !== null;

  // handleAction を効果内(ジェスチャー確定時)から安全に呼ぶための参照
  const handleActionRef = useRef<(action: AttendanceStatus) => void>(() => {});

  // シート表示中はRust側のジェスチャー認識をポーリングし、設定でステータスが
  // 割り当てられたジェスチャーが安定して検出されたらそのステータスで更新する。
  useEffect(() => {
    if (!member || busy) return;

    let cancelled = false;
    let inFlight = false;
    let errorLogged = false;
    let lastGesture: GestureKind | null = null;
    let streak = 0;

    const timer = window.setInterval(async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const result = await detectGesture();
        if (cancelled) return;
        errorLogged = false;
        setDetectedGesture(result.handDetected ? result.gesture : null);

        if (result.gesture !== "Unknown" && result.gesture === lastGesture) {
          streak += 1;
        } else {
          streak = 1;
        }
        lastGesture = result.gesture;

        if (
          streak >= GESTURE_STABLE_COUNT &&
          result.roomStatus &&
          (ATTENDANCE_STATUSES as string[]).includes(result.roomStatus)
        ) {
          streak = 0;
          handleActionRef.current(result.roomStatus as AttendanceStatus);
        }
      } catch (err) {
        // カメラフレーム未取得・ブラウザ単体実行など。ログを埋めないよう1回だけ記録
        if (!errorLogged) {
          errorLogged = true;
          console.error("[gesture] 認識エラー:", err);
        }
      } finally {
        inFlight = false;
      }
    }, GESTURE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [member, busy]);

  if (!member) return null;

  async function handleAction(action: AttendanceStatus) {
    if (!member || pendingAction || completedAction || action === member.status) return;
    setPendingAction(action);
    try {
      await postAttendance(
        member.username,
        member.name,
        action,
        settings.attendanceEndpoint,
        settings.apiToken,
        settings.attendanceBodyTemplate,
      );
      updateStatus(member.username, action);
      setCompletedAction(action);
      setTimeout(clearSelection, 1100);
    } finally {
      setPendingAction(null);
    }
  }
  handleActionRef.current = handleAction;

  // 設定でステータスが割り当てられているジェスチャーだけ案内に出す
  const gestureLegend = (
    [
      ["Rock", settings.gestureStatusMap.rock],
      ["Scissors", settings.gestureStatusMap.scissors],
      ["Paper", settings.gestureStatusMap.paper],
    ] as const
  ).filter(([, status]) => status !== "");

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fade-in dark:bg-slate-950/70">
      <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl animate-scale-in dark:border-white/10 dark:bg-slate-900 dark:shadow-black/40">
        <button
          onClick={clearSelection}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
          aria-label="閉じる"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-sky-500 text-2xl font-semibold text-white shadow-lg shadow-indigo-500/30">
            {member.name.slice(0, 1)}
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">{member.name}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">@{member.username}</p>
        </div>

        {completedAction ? (
          <div className="mt-8 flex flex-col items-center gap-3 py-4 animate-scale-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {completedAction} を記録しました
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {ATTENDANCE_STATUSES.map((action) => {
                const style = STATUS_STYLE[action];
                const Icon = style.icon;
                const isPending = pendingAction === action;
                const isCurrent = action === member.status;
                const isDisabled = pendingAction !== null || isCurrent;

                return (
                  <button
                    key={action}
                    onClick={() => handleAction(action)}
                    disabled={isDisabled}
                    className={`flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-xs font-medium ring-1 ring-inset transition disabled:cursor-not-allowed ${
                      isCurrent
                        ? "bg-slate-100 text-slate-400 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-500 dark:ring-white/5"
                        : `${style.actionClasses} disabled:opacity-40`
                    }`}
                  >
                    {isPending ? (
                      <span className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <Icon className="h-6 w-6" />
                    )}
                    {action}
                    {isCurrent && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-600">現在</span>
                    )}
                  </button>
                );
              })}
            </div>

            {gestureLegend.length > 0 && (
              <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
                <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
                  カメラにジェスチャーを向けても選択できます
                </p>
                <div className="mt-1.5 flex justify-center gap-4">
                  {gestureLegend.map(([gesture, status]) => (
                    <span
                      key={gesture}
                      className={`text-xs transition ${
                        detectedGesture === gesture
                          ? "scale-110 font-semibold text-sky-600 dark:text-sky-400"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {GESTURE_EMOJI[gesture]} {status}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
