import type { Dispatch, SetStateAction } from "react";
import {
  type AccentColor,
  type AppSettings,
  type AppearanceSettings,
  type BackgroundPattern,
  type MemberListLayout,
} from "@/shared/hooks/useSettings";
import { PaletteIcon } from "@/shared/ui/icons";
import { Field, SectionHeader, SettingsCard } from "../fields";

interface SectionProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

// スウォッチ表示用の代表色(各パレットの 500)。実際の適用は App.css の
// :root[data-accent=...] が行うため、ここは見本表示のみに使う。
const ACCENT_OPTIONS: { value: AccentColor; label: string; swatch: string }[] = [
  { value: "cyan", label: "シアン", swatch: "#06b6d4" },
  { value: "blue", label: "ブルー", swatch: "#3b82f6" },
  { value: "emerald", label: "エメラルド", swatch: "#10b981" },
  { value: "violet", label: "バイオレット", swatch: "#8b5cf6" },
  { value: "rose", label: "ローズ", swatch: "#f43f5e" },
  { value: "amber", label: "アンバー", swatch: "#f59e0b" },
];

const PATTERN_OPTIONS: { value: BackgroundPattern; label: string; previewClass: string }[] = [
  { value: "grid", label: "グリッド", previewClass: "cyber-grid" },
  { value: "dots", label: "ドット", previewClass: "cyber-dots" },
  { value: "diagonal", label: "斜線", previewClass: "cyber-diagonal" },
  { value: "circuit", label: "回路(動)", previewClass: "cyber-circuit" },
  { value: "signal", label: "信号(動)", previewClass: "cyber-signal" },
  { value: "none", label: "なし", previewClass: "" },
];

const LAYOUT_OPTIONS: { value: MemberListLayout; label: string; hint: string }[] = [
  { value: "grid", label: "グリッド", hint: "2列のカード(既定)" },
  { value: "compact", label: "コンパクト", hint: "3列の小さめカード" },
  { value: "list", label: "リスト", hint: "1列の横長リスト" },
];

const PANEL_BG_FIELDS: {
  key: "memberPanelBg" | "authPanelBg" | "registerPanelBg";
  label: string;
  hint: string;
}[] = [
  {
    key: "memberPanelBg",
    label: "左パネル(メンバー一覧)の背景色",
    hint: "トップ画面左側の背景を任意の色にします。未設定はテーマの既定色",
  },
  {
    key: "authPanelBg",
    label: "右パネル(顔認証)の背景色",
    hint: "トップ画面右側の背景を任意の色にします。未設定はテーマの既定色",
  },
  {
    key: "registerPanelBg",
    label: "顔登録画面の背景色",
    hint: "顔登録中に左パネルへ表示される登録フォームの背景色。未設定はテーマの既定色",
  },
];

export function AppearanceSection({ draft, setDraft }: SectionProps) {
  function setAppearance<K extends keyof AppearanceSettings>(
    key: K,
    value: AppearanceSettings[K],
  ) {
    setDraft((d) => ({ ...d, appearance: { ...d.appearance, [key]: value } }));
  }

  return (
    <SettingsCard>
      <SectionHeader
        icon={PaletteIcon}
        eyebrow="APPEARANCE"
        title="デザイン"
        description="アクセントカラー・背景・メンバー一覧の並べ方をカスタマイズします(保存前でも画面にプレビューされます)"
      />

      <div className="space-y-7">
        <div>
          <p className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            アクセントカラー
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            ボタン・見出し・グローなどアプリ全体の差し色が切り替わります
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACCENT_OPTIONS.map(({ value, label, swatch }) => {
              const active = draft.appearance.accentColor === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAppearance("accentColor", value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    active
                      ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-700 dark:border-cyan-400/50 dark:text-cyan-300"
                      : "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/25"
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full shadow-inner"
                    style={{ backgroundColor: swatch }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            背景パターン
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            トップ画面に薄く敷く装飾です。回路(動)・信号(動)は右側(顔認証パネル)の背景でアニメーションします
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PATTERN_OPTIONS.map(({ value, label, previewClass }) => {
              const active = draft.appearance.backgroundPattern === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAppearance("backgroundPattern", value)}
                  className={`overflow-hidden rounded-lg border text-xs font-medium transition ${
                    active
                      ? "border-cyan-500/60 text-cyan-700 ring-1 ring-cyan-500/40 dark:border-cyan-400/50 dark:text-cyan-300"
                      : "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-white/10 dark:text-slate-300 dark:hover:border-white/25"
                  }`}
                >
                  <span
                    className={`block h-12 w-full bg-slate-50 dark:bg-[#070b14] ${previewClass}`}
                  />
                  <span className="block border-t border-inherit py-1.5 text-center">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            メンバー一覧のレイアウト
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {LAYOUT_OPTIONS.map(({ value, label, hint }) => {
              const active = draft.appearance.memberListLayout === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAppearance("memberListLayout", value)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-cyan-500/60 bg-cyan-500/10 dark:border-cyan-400/50"
                      : "border-slate-300 hover:border-slate-400 dark:border-white/10 dark:hover:border-white/25"
                  }`}
                >
                  <span
                    className={`block text-xs font-medium ${
                      active
                        ? "text-cyan-700 dark:text-cyan-300"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-400 dark:text-slate-500">
                    {hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {PANEL_BG_FIELDS.map(({ key, label, hint }) => (
          <Field key={key} label={label} htmlFor={`appearance-${key}`} hint={hint}>
            <div className="flex items-center gap-2">
              <input
                id={`appearance-${key}`}
                type="color"
                // 未設定時はテーマに馴染む仮の色を見せる(クリアで既定に戻る)
                value={draft.appearance[key] || "#0f172a"}
                onChange={(e) => setAppearance(key, e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 dark:border-white/10 dark:bg-slate-900/50"
              />
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {draft.appearance[key] || "既定"}
              </span>
              {draft.appearance[key] && (
                <button
                  type="button"
                  onClick={() => setAppearance(key, "")}
                  className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-cyan-500/50 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-400"
                >
                  既定に戻す
                </button>
              )}
            </div>
          </Field>
        ))}
      </div>
    </SettingsCard>
  );
}
