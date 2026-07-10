import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "@/shared/hooks/useSettings";
import { useTheme } from "@/shared/theme/ThemeContext";
import { MoonIcon, SlidersIcon, SunIcon } from "@/shared/ui/icons";
import { Field, INPUT_CLASS, SectionHeader, SettingsCard } from "../fields";

interface SectionProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

export function GeneralSection({ draft, setDraft }: SectionProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <SettingsCard>
      <SectionHeader
        icon={SlidersIcon}
        eyebrow="GENERAL"
        title="一般"
        description="表示テーマと自動スケジュールを設定します"
      />

      <div className="space-y-5">
        <div>
          <p className="block text-xs font-medium text-slate-600 dark:text-slate-300">テーマ</p>
          <div className="mt-1.5 inline-flex rounded-lg border border-slate-300 p-1 dark:border-white/10">
            {(["light", "dark"] as const).map((t) => {
              const active = theme === t;
              const Icon = t === "light" ? SunIcon : MoonIcon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    if (!active) toggleTheme();
                  }}
                  className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-cyan-500/10 text-cyan-700 ring-1 ring-cyan-500/40 dark:text-cyan-300 dark:ring-cyan-400/40"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t === "light" ? "ライト" : "ダーク"}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="再起動スケジュール" htmlFor="reboot-schedule" hint="毎日この時刻に端末を自動再起動します">
          <input
            id="reboot-schedule"
            type="time"
            value={draft.rebootSchedule}
            onChange={(e) => setDraft((d) => ({ ...d, rebootSchedule: e.target.value }))}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="自動消灯時間" htmlFor="screen-off-schedule" hint="この時刻に画面を暗転させます">
          <input
            id="screen-off-schedule"
            type="time"
            value={draft.screenOffSchedule}
            onChange={(e) => setDraft((d) => ({ ...d, screenOffSchedule: e.target.value }))}
            className={INPUT_CLASS}
          />
        </Field>
      </div>
    </SettingsCard>
  );
}
