import type { Member } from "@/entities/member/api";

interface FaceMatchConfirmCardProps {
  member: Member;
  onConfirm: () => void;
  onReject: () => void;
}

export function FaceMatchConfirmCard({ member, onConfirm, onReject }: FaceMatchConfirmCardProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center p-6">
      <div className="cyber-corners w-full max-w-sm animate-slide-up rounded-xl border border-slate-200 bg-white/95 p-6 text-center shadow-2xl backdrop-blur dark:border-cyan-400/25 dark:bg-slate-900/95">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
          match found
        </p>
        <div className="mx-auto mt-2 flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-cyan-500 to-indigo-500 text-xl font-semibold text-white shadow-lg shadow-cyan-500/30">
          {member.name.slice(0, 1)}
        </div>
        <p className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
          {member.name} さんですか？
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onReject}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            ちがう
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 shadow-glow transition hover:bg-cyan-400"
          >
            はい
          </button>
        </div>
      </div>
    </div>
  );
}
