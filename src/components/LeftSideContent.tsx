import type { Member } from "../api/members";

interface LeftSideContentProps {
  members: Member[];
  isLoading: boolean;
  error: string | null;
  activeUsername: string | null;
  onSelectMember: (member: Member) => void;
}

export function LeftSideContent({
  members,
  isLoading,
  error,
  activeUsername,
  onSelectMember,
}: LeftSideContentProps) {
  return (
    <section className="flex h-full flex-col gap-4 p-6">
      <header>
        <h2 className="text-lg font-semibold text-white">メンバー</h2>
        <p className="text-sm text-slate-400">
          カードをタップすると在室状況を記録できます
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {error}
        </p>
      )}

      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pr-1">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-slate-800/60"
            />
          ))}

        {!isLoading &&
          members.map((member) => {
            const isActive = member.username === activeUsername;
            return (
              <button
                key={member.username}
                onClick={() => onSelectMember(member)}
                className={`group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition active:scale-95 ${
                  isActive
                    ? "border-sky-400/60 bg-sky-500/10 shadow-lg shadow-sky-500/10"
                    : "border-white/10 bg-slate-800/60 hover:border-white/20 hover:bg-slate-800"
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-sky-500 text-lg font-semibold text-white transition group-hover:scale-105">
                  {member.name.slice(0, 1)}
                </div>
                <p className="text-sm font-medium text-white">{member.name}</p>
                <p className="text-xs text-slate-400">@{member.username}</p>
              </button>
            );
          })}

        {!isLoading && members.length === 0 && !error && (
          <p className="col-span-2 py-8 text-center text-sm text-slate-500">
            メンバーが見つかりませんでした
          </p>
        )}
      </div>
    </section>
  );
}
