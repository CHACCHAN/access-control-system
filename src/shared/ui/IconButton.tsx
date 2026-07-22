import type { ReactNode } from "react";

// トップ画面ヘッダーに並ぶ正方形アイコンボタン(テーマ切替・更新・外部サイト・設定)
// の共通スタイル。同じ見た目のボタンが複数あるため1箇所に集約する。
const ICON_BUTTON_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-cyan-400/50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:shadow-none dark:hover:border-cyan-400/50 dark:hover:text-cyan-300";

// ホバー/フォーカス時にボタンの下へ出す説明ラベル。アイコンだけでは用途が
// 伝わらないため、マウス操作時の補助として表示する(タッチ操作の妨げに
// ならないよう pointer-events-none)。読み上げには button の aria-label を
// 使うので、この要素自体は aria-hidden にして二重読み上げを避ける。
const TOOLTIP_CLASS =
  "pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[10px] font-medium text-slate-600 opacity-0 shadow-lg backdrop-blur transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:border-cyan-400/25 dark:bg-slate-950/90 dark:text-slate-200";

interface IconButtonProps {
  /** ボタンの用途。aria-label とホバー時のツールチップの両方に使う */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

export function IconButton({ label, onClick, disabled = false, children }: IconButtonProps) {
  return (
    <div className="group relative flex shrink-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={ICON_BUTTON_CLASS}
      >
        {children}
      </button>
      <span aria-hidden="true" className={TOOLTIP_CLASS}>
        {label}
      </span>
    </div>
  );
}
