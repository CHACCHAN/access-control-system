import type { Member } from "../../entities/member/api";

interface FaceMatchConfirmCardProps {
  member: Member;
  onConfirm: () => void;
  onReject: () => void;
}

export function FaceMatchConfirmCard({ member, onConfirm, onReject }: FaceMatchConfirmCardProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center p-6">
      <div className="w-full max-w-sm animate-slide-up rounded-3xl border border-slate-200 bg-white/95 p-6 text-center shadow-2xl backdrop-blur dark:border-white/10 dark:bg-slate-900/95">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-sky-500 text-xl font-semibold text-white">
          {member.name.slice(0, 1)}
        </div>
        <p className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
          {member.name} さんですか？
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onReject}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            ちがう
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"
          >
            はい
          </button>
        </div>
      </div>
    </div>
  );
}
