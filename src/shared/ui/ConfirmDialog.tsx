import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { playUiSound } from "@/shared/lib/uiSound";

interface ConfirmDialogProps {
  /** 見出し(eyebrow)の文言と色。色で操作の重さを表す */
  eyebrow: string;
  eyebrowClass?: string;
  /** アイコンボックス(任意)。中身のアイコンと箱の色クラス */
  icon?: ReactNode;
  iconBoxClass?: string;
  /** ダイアログ枠の色 */
  borderClass?: string;
  title: string;
  message?: string;
  error?: string | null;
  cancelLabel?: string;
  confirmLabel: ReactNode;
  /** 実行ボタンの配色 */
  confirmButtonClass?: string;
  /** 実行中はスピナー表示とし、両ボタンを無効化する */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 確認ダイアログの共通部品(設定の保存確認・電源操作などで共用)。
 *
 * createPortal で document.body 直下に描画するのが重要: SettingsCard などの
 * backdrop-filter を持つ要素の内側で position: fixed を使うと、その要素が
 * 基準(containing block)になって「カードの中央」に出てしまうため、
 * どこから呼ばれても必ずビューポート全体を覆うよう body へ脱出させる。
 * 表示時に確認音を再生する。
 */
export function ConfirmDialog({
  eyebrow,
  eyebrowClass = "text-amber-500",
  icon,
  iconBoxClass = "",
  borderClass = "border-slate-200 dark:border-cyan-400/25",
  title,
  message,
  error,
  cancelLabel = "キャンセル",
  confirmLabel,
  confirmButtonClass = "bg-cyan-500 hover:bg-cyan-400 text-slate-950",
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    playUiSound("confirmation");
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-fade-in dark:bg-[#070b14]/80">
      <div
        className={`cyber-corners w-full max-w-sm rounded-xl border bg-white p-6 text-center shadow-2xl animate-scale-in dark:bg-slate-900 ${borderClass}`}
      >
        <p
          className={`font-mono text-[10px] font-medium uppercase tracking-[0.25em] ${eyebrowClass}`}
        >
          {eyebrow}
        </p>
        {icon && (
          <div
            className={`mx-auto mt-2 flex h-12 w-12 items-center justify-center rounded-xl ${iconBoxClass}`}
          >
            {icon}
          </div>
        )}
        <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{title}</p>
        {message && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{message}</p>}

        {error && (
          <p className="mt-3 font-mono text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmButtonClass}`}
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
