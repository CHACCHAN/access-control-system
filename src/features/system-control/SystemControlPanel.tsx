import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { restartComputer, shutdownComputer } from "./api";
import { CloseIcon, PowerIcon, RestartIcon } from "../../shared/ui/icons";

type PendingAction = "shutdown" | "restart" | null;

const ACTION_LABEL: Record<Exclude<PendingAction, null>, string> = {
  shutdown: "シャットダウン",
  restart: "再起動",
};

export function SystemControlPanel() {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tauri アプリとして動いていない(ブラウザ単体での開発時など)は表示しない
  if (!isTauri()) return null;

  async function handleConfirm() {
    if (!pendingAction) return;
    setIsExecuting(true);
    setError(null);
    try {
      await (pendingAction === "shutdown" ? shutdownComputer() : restartComputer());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsExecuting(false);
    }
  }

  function closeDialog() {
    if (isExecuting) return;
    setPendingAction(null);
    setError(null);
  }

  return (
    <>
      <div className="fixed bottom-4 left-4 z-40 flex gap-2">
        <button
          onClick={() => setPendingAction("restart")}
          className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <RestartIcon className="h-4 w-4" />
          再起動
        </button>
        <button
          onClick={() => setPendingAction("shutdown")}
          className="flex h-9 items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3.5 text-xs font-medium text-rose-600 shadow-sm transition hover:bg-rose-50 dark:border-rose-500/20 dark:bg-slate-800/80 dark:text-rose-400 dark:hover:bg-rose-500/10"
        >
          <PowerIcon className="h-4 w-4" />
          シャットダウン
        </button>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fade-in dark:bg-slate-950/70">
          <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-2xl animate-scale-in dark:border-white/10 dark:bg-slate-900">
            <button
              onClick={closeDialog}
              disabled={isExecuting}
              className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
              aria-label="閉じる"
            >
              <CloseIcon className="h-5 w-5" />
            </button>

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 dark:text-rose-400">
              {pendingAction === "shutdown" ? (
                <PowerIcon className="h-7 w-7" />
              ) : (
                <RestartIcon className="h-7 w-7" />
              )}
            </div>
            <p className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
              本当に{ACTION_LABEL[pendingAction]}しますか？
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              このコンピュータが{pendingAction === "shutdown" ? "電源オフになります" : "再起動します"}
            </p>

            {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

            <div className="mt-6 flex gap-3">
              <button
                onClick={closeDialog}
                disabled={isExecuting}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                disabled={isExecuting}
                className="flex-1 rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExecuting ? (
                  <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  `${ACTION_LABEL[pendingAction]}する`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
