import type { ReactNode } from "react";

// 設定ページ全体で共通の、GitHub 風 + サイバー調のフォーム部品。
// 入力はやや角を落とした矩形(rounded-lg)にシアンのフォーカスリングを合わせ、
// エンドポイント/トークンなど機械的な値は等幅フォントで見せる。

export const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/15";

export const MONO_INPUT_CLASS = `${INPUT_CLASS} font-mono`;

export const TEXTAREA_CLASS =
  "w-full resize-none rounded-lg border bg-white px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:bg-slate-900/50 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/15";

interface IconType {
  ({ className }: { className?: string }): ReactNode;
}

/**
 * セクション見出し。アイコン + 等幅の英語ラベル(サイバー感) + 日本語タイトル。
 */
export function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: IconType;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-3.5">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-600 dark:border-cyan-400/20 dark:text-cyan-400">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-cyan-600/80 dark:text-cyan-400/70">
          {eyebrow}
        </p>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
    </div>
  );
}

/**
 * ラベル + 補足 + 入力欄のひとまとまり。
 */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-slate-600 dark:text-slate-300"
      >
        {label}
      </label>
      {hint && (
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          {hint}
        </p>
      )}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * 設定セクションを囲むカード。四隅に HUD 風のシアンマーカーを添える。
 */
export function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="cyber-corners rounded-xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/40 dark:shadow-none dark:backdrop-blur-sm">
      {children}
    </div>
  );
}
