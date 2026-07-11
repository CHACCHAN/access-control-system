import type { Dispatch, SetStateAction } from "react";
import {
  clampUiScale,
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  type AppSettings,
} from "@/shared/hooks/useSettings";
import { useTheme } from "@/shared/theme/ThemeContext";
import { MoonIcon, SlidersIcon, SunIcon } from "@/shared/ui/icons";
import { Field, INPUT_CLASS, SectionHeader, SettingsCard } from "../fields";

interface SectionProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

// 拡大率のプリセット(スライダーと併用。素早く代表値へ合わせるため)
const UI_SCALE_PRESETS = [0.9, 1, 1.1, 1.25] as const;

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

        <div>
          <div className="flex items-center justify-between">
            <p className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              UI スケール
            </p>
            <span className="font-mono text-xs text-cyan-700 dark:text-cyan-300">
              {Math.round(draft.uiScale * 100)}%
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            画面全体の文字・余白・ボタンの大きさをまとめて拡大縮小します(設置ディスプレイやタッチ操作に合わせて調整)
          </p>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="ui-scale"
              type="range"
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={0.05}
              value={draft.uiScale}
              onChange={(e) =>
                setDraft((d) => ({ ...d, uiScale: clampUiScale(e.target.valueAsNumber) }))
              }
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-cyan-500 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, uiScale: UI_SCALE_DEFAULT }))}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
            >
              リセット
            </button>
          </div>
          <div className="mt-2 inline-flex rounded-lg border border-slate-300 p-1 dark:border-white/10">
            {UI_SCALE_PRESETS.map((preset) => {
              const active = Math.abs(draft.uiScale - preset) < 0.001;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, uiScale: preset }))}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-cyan-500/10 text-cyan-700 ring-1 ring-cyan-500/40 dark:text-cyan-300 dark:ring-cyan-400/40"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {Math.round(preset * 100)}%
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
