import { useState, type ReactElement } from "react";
import type { Member } from "../api/members";
import { ATTENDANCE_ACTIONS, postAttendance, type AttendanceAction } from "../api/attendance";
import { CheckIcon, CloseIcon, DoorIcon, HomeIcon, WalkIcon } from "./icons";

interface AttendanceActionSheetProps {
  member: Member;
  onClose: () => void;
}

const ACTION_STYLE: Record<
  AttendanceAction,
  { icon: (props: { className?: string }) => ReactElement; classes: string }
> = {
  present: {
    icon: DoorIcon,
    classes: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/30 hover:bg-emerald-500/20",
  },
  away: {
    icon: WalkIcon,
    classes: "bg-amber-500/10 text-amber-300 ring-amber-400/30 hover:bg-amber-500/20",
  },
  home: {
    icon: HomeIcon,
    classes: "bg-sky-500/10 text-sky-300 ring-sky-400/30 hover:bg-sky-500/20",
  },
};

export function AttendanceActionSheet({ member, onClose }: AttendanceActionSheetProps) {
  const [pendingAction, setPendingAction] = useState<AttendanceAction | null>(null);
  const [completedAction, setCompletedAction] = useState<AttendanceAction | null>(null);

  async function handleAction(action: AttendanceAction) {
    if (pendingAction || completedAction) return;
    setPendingAction(action);
    try {
      await postAttendance(member.username, action);
      setCompletedAction(action);
      setTimeout(onClose, 1100);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl shadow-black/40 animate-scale-in">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
          aria-label="閉じる"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-sky-500 text-2xl font-semibold text-white shadow-lg shadow-indigo-500/30">
            {member.name.slice(0, 1)}
          </div>
          <p className="mt-3 text-lg font-semibold text-white">{member.name}</p>
          <p className="text-sm text-slate-400">@{member.username}</p>
        </div>

        {completedAction ? (
          <div className="mt-8 flex flex-col items-center gap-3 py-4 animate-scale-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-200">
              {ATTENDANCE_ACTIONS.find((o) => o.action === completedAction)?.label} を記録しました
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-3 gap-3">
            {ATTENDANCE_ACTIONS.map(({ action, label }) => {
              const style = ACTION_STYLE[action];
              const Icon = style.icon;
              const isPending = pendingAction === action;
              return (
                <button
                  key={action}
                  onClick={() => handleAction(action)}
                  disabled={pendingAction !== null}
                  className={`flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-xs font-medium ring-1 ring-inset transition disabled:opacity-40 ${style.classes}`}
                >
                  {isPending ? (
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Icon className="h-6 w-6" />
                  )}
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
