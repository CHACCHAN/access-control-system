import type { Dispatch, SetStateAction } from "react";
import type { AppSettings, GestureStatusMap } from "@/shared/hooks/useSettings";
import { ATTENDANCE_STATUSES } from "@/entities/member/statusStyle";
import {
  GesturePaperIcon,
  GestureRockIcon,
  GestureScissorsIcon,
  GestureThumbsDownIcon,
  HandIcon,
} from "@/shared/ui/icons";
import { SectionHeader, SettingsCard } from "../fields";

interface SectionProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

interface IconType {
  ({ className }: { className?: string }): React.ReactNode;
}

const GESTURE_FIELDS: { key: keyof GestureStatusMap; icon: IconType; label: string }[] = [
  { key: "rock", icon: GestureRockIcon, label: "グー" },
  { key: "scissors", icon: GestureScissorsIcon, label: "チョキ" },
  { key: "paper", icon: GesturePaperIcon, label: "パー" },
];

export function GestureSection({ draft, setDraft }: SectionProps) {
  return (
    <SettingsCard>
      <SectionHeader
        icon={HandIcon}
        eyebrow="GESTURE"
        title="ジェスチャー"
        description="カメラに向けた手の形で、画面に触れずに在室ステータスの更新や確認の操作ができます"
      />

      <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
        status
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {GESTURE_FIELDS.map(({ key, icon: Icon, label }) => (
          <div
            key={key}
            className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-center dark:border-white/10 dark:bg-slate-950/40"
          >
            <Icon className="mx-auto h-8 w-8 text-cyan-600 dark:text-cyan-400" />
            <p className="mt-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p>
            {/* ダークテーマで OS 標準のプルダウンが見づらいため、ボタン選択式にする */}
            <div className="mt-3 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={`${label}の在室ステータス`}>
              {[...ATTENDANCE_STATUSES, ""].map((status) => {
                const active = draft.gestureStatusMap[key] === status;
                return (
                  <button
                    key={status || "none"}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        gestureStatusMap: { ...d.gestureStatusMap, [key]: status },
                      }))
                    }
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-700 ring-1 ring-cyan-500/40 dark:border-cyan-400/50 dark:text-cyan-300 dark:ring-cyan-400/40"
                        : "border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-white/10 dark:text-slate-400 dark:hover:border-white/25 dark:hover:text-slate-200"
                    }`}
                  >
                    {status || "なし"}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 確認カード(「◯◯さんですか?」)で「ちがう」を意味するジェスチャー。
          在室ステータスとは独立した確認用アクションで、非接触で否認できる。 */}
      <p className="mb-3 mt-6 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
        confirm
      </p>
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-slate-950/40">
        <div className="flex items-center gap-3">
          <GestureThumbsDownIcon className="h-8 w-8 shrink-0 text-rose-500 dark:text-rose-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              「ちがう」ジェスチャー
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              顔認証の確認カード(「◯◯さんですか?」)でこのジェスチャーをかざすと、画面に触れずに「ちがう」を選べます
            </p>
          </div>
          <div
            className="flex shrink-0 gap-1.5"
            role="radiogroup"
            aria-label="「ちがう」ジェスチャーの割り当て"
          >
            {([
              ["ThumbsDown", "サムズダウン"],
              ["", "なし"],
            ] as const).map(([value, label]) => {
              const active = draft.rejectGesture === value;
              return (
                <button
                  key={value || "none"}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDraft((d) => ({ ...d, rejectGesture: value }))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-700 ring-1 ring-cyan-500/40 dark:border-cyan-400/50 dark:text-cyan-300 dark:ring-cyan-400/40"
                      : "border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-white/10 dark:text-slate-400 dark:hover:border-white/25 dark:hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
