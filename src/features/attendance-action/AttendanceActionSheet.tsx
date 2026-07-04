import { useState } from "react";
import type { AttendanceStatus, Member } from "../../entities/member/api";
import { ATTENDANCE_STATUSES, STATUS_STYLE } from "../../entities/member/statusStyle";
import { postAttendance } from "./api";
import { CheckIcon, CloseIcon } from "../../shared/ui/icons";

interface AttendanceActionSheetProps {
  member: Member;
  onClose: () => void;
  onStatusChange: (username: string, status: AttendanceStatus) => void;
}

export function AttendanceActionSheet({
  member,
  onClose,
  onStatusChange,
}: AttendanceActionSheetProps) {
  const [pendingAction, setPendingAction] = useState<AttendanceStatus | null>(null);
  const [completedAction, setCompletedAction] = useState<AttendanceStatus | null>(null);

  async function handleAction(action: AttendanceStatus) {
    if (pendingAction || completedAction || action === member.status) return;
    setPendingAction(action);
    try {
      await postAttendance(member.username, action);
      onStatusChange(member.username, action);
      setCompletedAction(action);
      setTimeout(onClose, 1100);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fade-in dark:bg-slate-950/70">
      <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl animate-scale-in dark:border-white/10 dark:bg-slate-900 dark:shadow-black/40">
        <button
          onClick={onClose}
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
        )}
      </div>
    </div>
  );
}
