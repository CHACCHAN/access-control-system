import { useMembers } from "@/entities/member/MemberContext";
import { ATTENDANCE_STATUSES } from "@/entities/member/statusStyle";
import { MemberCard } from "./MemberCard";

export function MemberListPanel() {
  const { members, isLoading, error, activeMember, selectMember } = useMembers();

  const sortedMembers = [...members].sort(
    (a, b) => ATTENDANCE_STATUSES.indexOf(a.status) - ATTENDANCE_STATUSES.indexOf(b.status),
  );

  return (
    <section className="flex h-full flex-col gap-4 bg-slate-50 p-6 dark:bg-slate-950">
      <header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">メンバー</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          カードをタップすると在室状況を記録できます
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pr-1">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800/60"
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
          <p className="col-span-2 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            メンバーが見つかりませんでした
          </p>
        )}
      </div>
    </section>
  );
}
