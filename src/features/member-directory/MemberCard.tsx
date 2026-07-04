import type { Member } from "../../entities/member/api";
import { STATUS_STYLE } from "../../entities/member/statusStyle";

interface MemberCardProps {
  member: Member;
  isActive: boolean;
  onSelect: (member: Member) => void;
}

export function MemberCard({ member, isActive, onSelect }: MemberCardProps) {
  const { cardClasses, badgeClasses } = STATUS_STYLE[member.status];

  return (
    <button
      onClick={() => onSelect(member)}
      className={`group relative flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition active:scale-95 ${cardClasses} ${
        isActive
          ? "ring-2 ring-sky-400/70 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950"
          : ""
      }`}
    >
      <span
        className={`absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClasses}`}
      >
        {member.status}
      </span>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-sky-500 text-lg font-semibold text-white transition group-hover:scale-105">
        {member.name.slice(0, 1)}
      </div>
      <p className="text-sm font-medium text-slate-900 dark:text-white">{member.name}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">@{member.username}</p>
    </button>
  );
}
