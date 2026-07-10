import type { Dispatch, SetStateAction } from "react";
import type { AppSettings, GestureStatusMap } from "@/shared/hooks/useSettings";
import { ATTENDANCE_STATUSES } from "@/entities/member/statusStyle";
import { HandIcon } from "@/shared/ui/icons";
import { INPUT_CLASS, SectionHeader, SettingsCard } from "../fields";

interface SectionProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

const GESTURE_FIELDS: { key: keyof GestureStatusMap; emoji: string; label: string }[] = [
  { key: "rock", emoji: "✊", label: "グー" },
  { key: "scissors", emoji: "✌️", label: "チョキ" },
  { key: "paper", emoji: "✋", label: "パー" },
];

export function GestureSection({ draft, setDraft }: SectionProps) {
  return (
    <SettingsCard>
      <SectionHeader
        icon={HandIcon}
        eyebrow="GESTURE"
        title="ジェスチャー"
        description="カメラに向けた手の形で在室ステータスを更新します"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {GESTURE_FIELDS.map(({ key, emoji, label }) => (
          <div
            key={key}
            className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-center dark:border-white/10 dark:bg-slate-950/40"
          >
            <div className="text-3xl leading-none">{emoji}</div>
            <p className="mt-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p>
            <label htmlFor={`gesture-${key}`} className="sr-only">
              {label}の在室ステータス
            </label>
            <select
              id={`gesture-${key}`}
              value={draft.gestureStatusMap[key]}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  gestureStatusMap: { ...d.gestureStatusMap, [key]: e.target.value },
                }))
              }
              className={`${INPUT_CLASS} mt-3 text-center`}
            >
              {ATTENDANCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
              <option value="">なし</option>
            </select>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}
