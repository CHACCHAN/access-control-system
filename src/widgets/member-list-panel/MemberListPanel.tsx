import { useMembers } from "@/entities/member/MemberContext";
import { ATTENDANCE_STATUSES } from "@/entities/member/statusStyle";
import { MemberCard } from "./MemberCard";

export function MemberListPanel() {
  const { members, isLoading, error, activeMember, selectMember } = useMembers();

  const sortedMembers = [...members].sort(
    (a, b) => ATTENDANCE_STATUSES.indexOf(a.status) - ATTENDANCE_STATUSES.indexOf(b.status),
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 bg-slate-50/60 p-6 dark:bg-transparent">
      <header className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
            // members
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            メンバー
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            カードをタップすると在室状況を記録できます
          </p>
        </div>
        {!isLoading && !error && (
          <span className="mb-1 flex items-center gap-1.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
            {members.length} online
          </span>
        )}
      </header>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 font-mono text-xs text-rose-600 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pr-1">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-200/60 dark:border-white/5 dark:bg-slate-800/40"
            />
          ))}

        {!isLoading &&
          sortedMembers.map((member) => (
            <MemberCard
              key={member.username}
              member={member}
              isActive={member.username === activeMember?.username}
              onSelect={selectMember}
            />
          ))}

        {!isLoading && members.length === 0 && !error && (
          <p className="col-span-2 py-8 text-center font-mono text-sm text-slate-400 dark:text-slate-500">
            メンバーが見つかりませんでした
          </p>
        )}
      </div>
    </section>
  );
}
