import { useMembers } from "@/entities/member/MemberContext";
import { ATTENDANCE_STATUSES } from "@/entities/member/statusStyle";
import { FaceRegistrationForm } from "@/features/face-auth/FaceRegistrationForm";
import { useSettings, type MemberListLayout } from "@/shared/hooks/useSettings";
import type { AuthMode } from "@/app/App";
import { MemberCard } from "./MemberCard";

// 設定(appearance.memberListLayout)→ 一覧コンテナのクラス
const LAYOUT_CLASS: Record<MemberListLayout, string> = {
  grid: "grid auto-rows-min grid-cols-2 gap-3",
  compact: "grid auto-rows-min grid-cols-3 gap-2",
  list: "flex flex-col gap-2",
};

interface MemberListPanelProps {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
}

export function MemberListPanel({ mode, setMode }: MemberListPanelProps) {
  const { members, isLoading, error, activeMember, selectMember } = useMembers();
  const { settings } = useSettings();

  // 顔登録中はメンバー一覧の位置に登録フォームを差し替える(右側のカメラは
  // 検出可視化を続けたまま、左で名前を選んで登録できるようにする)。
  if (mode === "register") {
    return <FaceRegistrationForm onClose={() => setMode("recognize")} />;
  }

  const layout = settings.appearance.memberListLayout;
  const customBg = settings.appearance.memberPanelBg;

  const sortedMembers = [...members].sort(
    (a, b) => ATTENDANCE_STATUSES.indexOf(a.status) - ATTENDANCE_STATUSES.indexOf(b.status),
  );

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-4 bg-slate-50/60 p-6 dark:bg-transparent"
      // background ショートハンドで既定のクラス指定(グラデーション含む)ごと上書きする
      style={customBg ? { background: customBg } : undefined}
    >
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

      <div className={`min-h-0 flex-1 overflow-y-auto pr-1 ${LAYOUT_CLASS[layout] ?? LAYOUT_CLASS.grid}`}>
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`animate-pulse rounded-xl border border-slate-200 bg-slate-200/60 dark:border-white/5 dark:bg-slate-800/40 ${
                layout === "list" ? "h-16" : "h-28"
              }`}
            />
          ))}

        {!isLoading &&
          sortedMembers.map((member) => (
            <MemberCard
              key={member.username}
              member={member}
              isActive={member.username === activeMember?.username}
              onSelect={selectMember}
              variant={layout === "list" ? "row" : "card"}
            />
          ))}

        {!isLoading && members.length === 0 && !error && (
          <p className="col-span-full py-8 text-center font-mono text-sm text-slate-400 dark:text-slate-500">
            メンバーが見つかりませんでした
          </p>
        )}
      </div>
    </section>
  );
}
