import { useEffect, useId, useRef, useState } from "react";
import type { AttendanceStatus } from "@/entities/member/model";
import { useMembers } from "@/entities/member/MemberContext";
import { ATTENDANCE_STATUSES, STATUS_STYLE } from "@/entities/member/statusStyle";
import { useSettings } from "@/shared/hooks/useSettings";
import { playUiSound } from "@/shared/lib/uiSound";
import { GestureGuide } from "@/features/gesture/GestureGuide";
import { GestureCountdown } from "@/features/gesture/GestureCountdown";
import { useGestureStatusLoop } from "@/features/gesture/useGestureStatusLoop";
import { postAttendance } from "@/entities/member/attendanceApi";
import { CheckIcon, CloseIcon } from "@/shared/ui/icons";
import { useDialogAccessibility } from "@/shared/hooks/useDialogAccessibility";

export function AttendanceActionSheet({ isInteractive = true }: { isInteractive?: boolean }) {
  const { activeMember: member, clearSelection, clearSelectionIf, updateStatus } = useMembers();
  const { settings } = useSettings();
  const [pendingAction, setPendingAction] = useState<AttendanceStatus | null>(null);
  const [completedAction, setCompletedAction] = useState<AttendanceStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const activeUsernameRef = useRef<string | null>(member?.username ?? null);
  activeUsernameRef.current = member?.username ?? null;

  // シートは選択メンバーが変わっても同一コンポーネントとして存在し続ける(null を
  // 返して非表示になるだけ)ため、前回の完了表示が次のメンバーに引き継がれないよう
  // 対象メンバーが変わるたびにローカル状態をリセットする
  useEffect(() => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    setPendingAction(null);
    setCompletedAction(null);
    setErrorMessage(null);
  }, [member?.username]);

  useEffect(
    () => () => {
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    },
    [],
  );

  const busy = pendingAction !== null || completedAction !== null;
  const titleId = useId();
  const closeButtonRef = useDialogAccessibility(clearSelection, busy, member !== null);

  // handleAction を効果内(ジェスチャー確定時)から安全に呼ぶための参照
  const handleActionRef = useRef<(action: AttendanceStatus) => void>(() => {});

  // シート表示中(手動選択で開いた場合=顔認証で特定されていない人も含む)は
  // ジェスチャー操作を受け付ける。このシート表示中は顔認証ループが停止して
  // いるため、CPU(i7-3770想定)を取り合うことはない。
  // 送信中(pendingAction)も active を維持し、多重実行は handleAction 側で弾く
  // (active を落とすとループ再起動で発火済みガードが外れ、再送になり得る)。
  const { detectedGesture, countdown } = useGestureStatusLoop({
    active: isInteractive && member !== null && completedAction === null,
    onStatus: (status) => handleActionRef.current(status),
    unavailableStatus: member?.status ?? null,
  });

  if (!member) return null;

  async function handleAction(action: AttendanceStatus) {
    if (!member || pendingAction || completedAction || action === member.status) return;
    const username = member.username;
    setPendingAction(action);
    setErrorMessage(null);
    try {
      await postAttendance(
        member.username,
        member.name,
        action,
        settings.attendanceEndpoint,
        settings.apiToken,
        settings.attendanceBodyTemplate,
      );
      if (activeUsernameRef.current !== username) return;
      playUiSound("success");
      updateStatus(username, action);
      setCompletedAction(action);
      completionTimerRef.current = window.setTimeout(() => {
        clearSelectionIf(username);
        completionTimerRef.current = null;
      }, 1100);
    } catch (err) {
      if (activeUsernameRef.current !== username) return;
      playUiSound("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      if (activeUsernameRef.current === username) setPendingAction(null);
    }
  }
  handleActionRef.current = handleAction;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-fade-in dark:bg-[#070b14]/80">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="cyber-corners relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-2xl animate-scale-in dark:border-cyan-400/20 dark:bg-slate-900 dark:shadow-black/40"
      >
        <button
          ref={closeButtonRef}
          onClick={clearSelection}
          disabled={busy}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
          aria-label="閉じる"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-linear-to-br from-cyan-500 to-indigo-500 text-2xl font-semibold text-white shadow-lg shadow-cyan-500/30">
            {member.name.slice(0, 1)}
          </div>
          <p id={titleId} className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
            {member.name}
          </p>
          <p className="font-mono text-sm text-slate-500 dark:text-slate-400">@{member.username}</p>
        </div>

        {completedAction ? (
          <div role="status" className="mt-8 flex flex-col items-center gap-3 py-4 animate-scale-in">
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
                    className={`flex flex-col items-center gap-2 rounded-xl px-2 py-4 text-xs font-medium ring-1 ring-inset transition disabled:cursor-not-allowed ${
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

            {errorMessage && (
              <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-400">
                {errorMessage}
              </p>
            )}

            <div className="mt-5">
              {countdown ? (
                <GestureCountdown countdown={countdown} />
              ) : (
                <GestureGuide
                  detectedGesture={detectedGesture}
                  title="カメラに手をかざすと、ジェスチャーでも記録できます"
                  unavailableStatus={member.status}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
