import type { Dispatch, SetStateAction } from "react";
import {
  clampHardwareVolume,
  clampUiScale,
  HARDWARE_VOLUME_DEFAULT,
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  useSettings,
  type AppSettings,
} from "@/shared/hooks/useSettings";
import { playUiSound } from "@/shared/lib/uiSound";
import { useTheme } from "@/shared/theme/ThemeContext";
import { MoonIcon, SlidersIcon, SunIcon } from "@/shared/ui/icons";
import { Field, INPUT_CLASS, SectionHeader, SettingsCard, ToggleField } from "../fields";

interface SectionProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

// 拡大率のプリセット(スライダーと併用。素早く代表値へ合わせるため)
const UI_SCALE_PRESETS = [0.9, 1, 1.1, 1.25] as const;

export function GeneralSection({ draft, setDraft }: SectionProps) {
  const { theme, toggleTheme } = useTheme();
  const { updateSettings } = useSettings();

  // UIスケール・音量は「保存」不要の即時反映。設定へ直接書き込みつつ、
  // draft にも同じ値を入れて保存ボタンの未保存判定・保存内容と矛盾しないようにする。
  function applyNow(partial: Partial<AppSettings>) {
    setDraft((d) => ({ ...d, ...partial }));
    void updateSettings(partial);
  }

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
                  aria-pressed={active}
                  onClick={() => {
                    if (active) return;
                    toggleTheme();
                    // テーマも即時反映のため、後から「保存」しても巻き戻らないよう draft を揃える
                    setDraft((d) => ({ ...d, theme: t }));
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
            画面全体の文字・余白・ボタンの大きさをまとめて拡大縮小します。動かすと即座に反映されます(保存不要)
          </p>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="ui-scale"
              type="range"
              aria-label="UIスケール"
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={0.05}
              value={draft.uiScale}
              onChange={(e) => applyNow({ uiScale: clampUiScale(e.target.valueAsNumber) })}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-cyan-500 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={() => applyNow({ uiScale: UI_SCALE_DEFAULT })}
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
                  onClick={() => applyNow({ uiScale: preset })}
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

        <div>
          <div className="flex items-center justify-between">
            <p className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              音量
            </p>
            <span className="font-mono text-xs text-cyan-700 dark:text-cyan-300">
              {draft.hardwareVolume}%
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            スピーカーのハードウェア音量(ALSA)を直接操作します。動かすと即座に端末へ反映されます(保存不要)
          </p>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="hardware-volume"
              type="range"
              aria-label="ハードウェア音量"
              min={0}
              max={100}
              step={5}
              value={draft.hardwareVolume}
              onChange={(e) =>
                applyNow({ hardwareVolume: clampHardwareVolume(e.target.valueAsNumber) })
              }
              // スライダーを離したタイミングで効果音を鳴らし、音量を耳で確認できるようにする
              onPointerUp={() => playUiSound("click")}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-cyan-500 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={() => applyNow({ hardwareVolume: HARDWARE_VOLUME_DEFAULT })}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
            >
              リセット
            </button>
          </div>
        </div>

        <div className="space-y-4 border-t border-dashed border-slate-200 pt-5 dark:border-white/10">
          <ToggleField
            label="自動再起動"
            hint="毎日決まった時刻に端末を自動再起動します"
            checked={draft.rebootScheduleEnabled}
            onChange={(checked) => setDraft((d) => ({ ...d, rebootScheduleEnabled: checked }))}
          />
          <Field label="再起動時刻" htmlFor="reboot-schedule" hint="HH:MM(空欄で無効)">
            <input
              id="reboot-schedule"
              type="time"
              value={draft.rebootSchedule}
              disabled={!draft.rebootScheduleEnabled}
              onChange={(e) => setDraft((d) => ({ ...d, rebootSchedule: e.target.value }))}
              className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
            />
          </Field>
        </div>

        <div className="space-y-4 border-t border-dashed border-slate-200 pt-5 dark:border-white/10">
          <ToggleField
            label="自動消灯"
            hint="無操作が続いたら画面を物理消灯します(発熱対策)。操作するか人が近づくと復帰します"
            checked={draft.screenOffEnabled}
            onChange={(checked) => setDraft((d) => ({ ...d, screenOffEnabled: checked }))}
          />
          <Field
            label="自動消灯時間"
            htmlFor="screen-off-minutes"
            hint="無操作がこの時間続くと消灯します(0 で無効)"
          >
            <div className="flex items-center gap-2">
              <input
                id="screen-off-minutes"
                type="number"
                min={0}
                max={720}
                step={1}
                value={draft.screenOffMinutes}
                disabled={!draft.screenOffEnabled}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  setDraft((d) => ({
                    ...d,
                    screenOffMinutes: Number.isNaN(n) ? 0 : Math.max(0, Math.round(n)),
                  }));
                }}
                className={`${INPUT_CLASS} w-28 disabled:cursor-not-allowed disabled:opacity-50`}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">分</span>
            </div>
          </Field>
        </div>

        <div className="border-t border-dashed border-slate-200 pt-5 dark:border-white/10">
          <ToggleField
            label="人物不在時の減光"
            hint="カメラに人が写っておらず操作も無い状態が10秒続くと画面を半分暗くします(自動消灯とは別)。人が近づくか操作すると即復帰します"
            checked={draft.presenceDimmingEnabled}
            onChange={(checked) => setDraft((d) => ({ ...d, presenceDimmingEnabled: checked }))}
          />
        </div>
      </div>
    </SettingsCard>
  );
}
