import type { AttendanceStatus } from "./api";
import { DoorIcon, HomeIcon, WalkIcon } from "../../shared/ui/icons";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["在室", "外出", "帰宅"];

export const STATUS_STYLE: Record<
  AttendanceStatus,
  { icon: typeof DoorIcon; actionClasses: string; badgeClasses: string; cardClasses: string }
> = {
  在室: {
    icon: DoorIcon,
    actionClasses:
      "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400/30",
    badgeClasses: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
    cardClasses:
      "border-emerald-400/40 bg-linear-to-br from-emerald-500/20 via-emerald-500/5 to-white/60 hover:from-emerald-500/30 dark:border-emerald-400/30 dark:from-emerald-500/25 dark:via-emerald-600/10 dark:to-slate-900/60 dark:hover:from-emerald-500/35",
  },
  外出: {
    icon: WalkIcon,
    actionClasses:
      "bg-amber-500/10 text-amber-700 ring-amber-500/30 hover:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-400/30",
    badgeClasses: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
    cardClasses:
      "border-amber-400/40 bg-linear-to-br from-amber-500/20 via-amber-500/5 to-white/60 hover:from-amber-500/30 dark:border-amber-400/30 dark:from-amber-500/25 dark:via-amber-600/10 dark:to-slate-900/60 dark:hover:from-amber-500/35",
  },
  帰宅: {
    icon: HomeIcon,
    actionClasses:
      "bg-slate-500/10 text-slate-600 ring-slate-400/40 hover:bg-slate-500/20 dark:text-slate-300 dark:ring-slate-400/30",
    badgeClasses: "bg-slate-500/15 text-slate-600 dark:bg-slate-500/25 dark:text-slate-200",
    cardClasses:
      "border-slate-400/40 bg-linear-to-br from-slate-400/20 via-slate-400/5 to-white/60 hover:from-slate-400/30 dark:border-slate-500/30 dark:from-slate-600/25 dark:via-slate-700/10 dark:to-slate-900/60 dark:hover:from-slate-600/35",
  },
};
