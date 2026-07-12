import { memo } from "react";
import type { Member } from "@/entities/member/model";
import { STATUS_STYLE } from "@/entities/member/statusStyle";

interface MemberCardProps {
  member: Member;
  isActive: boolean;
  onSelect: (member: Member) => void;
  /** card: 縦積みのカード(グリッド用) / row: 横並びの1行(リスト用) */
  variant?: "card" | "row";
}

function MemberCardComponent({ member, isActive, onSelect, variant = "card" }: MemberCardProps) {
  const { cardClasses, badgeClasses } = STATUS_STYLE[member.status];
  const activeRing = isActive
    ? "ring-2 ring-cyan-400/70 ring-offset-2 ring-offset-slate-50 dark:ring-offset-[#070b14]"
    : "";

  if (variant === "row") {
    return (
      <button
        onClick={() => onSelect(member)}
        className={`group relative flex items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.98] ${cardClasses} ${activeRing}`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-cyan-500 to-indigo-500 text-base font-semibold text-white shadow-lg shadow-cyan-500/20 transition group-hover:scale-105">
          {member.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
            {member.name}
          </p>
          <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
            @{member.username}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] font-medium ${badgeClasses}`}
        >
          {member.status}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onSelect(member)}
      className={`group relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition active:scale-95 ${cardClasses} ${activeRing}`}
    >
      <span
        className={`absolute right-2.5 top-2.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-medium ${badgeClasses}`}
      >
        {member.status}
      </span>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-cyan-500 to-indigo-500 text-lg font-semibold text-white shadow-lg shadow-cyan-500/20 transition group-hover:scale-105">
        {member.name.slice(0, 1)}
      </div>
      <p className="text-sm font-medium text-slate-900 dark:text-white">{member.name}</p>
      <p className="font-mono text-xs text-slate-500 dark:text-slate-400">@{member.username}</p>
    </button>
  );
}

/** 一覧内で変更の無いカードまで再描画しない。 */
export const MemberCard = memo(MemberCardComponent);
