import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useAppVersion } from "@/shared/hooks/useAppVersion";
import { exitToShell } from "@/widgets/system-control-panel/api";
import { ServerIcon } from "@/shared/ui/icons";
import { SectionHeader, SettingsCard } from "../fields";

/**
 * システム操作(危険区域)。アプリを終了して起動前のシェルに戻る操作を
 * 確認付きで提供する。バージョン情報もここに集約する。
 */
export function SystemSection() {
  const version = useAppVersion();
  const [isConfirmingExit, setIsConfirmingExit] = useState(false);

  async function handleExitToShell() {
    if (isTauri()) {
      await exitToShell();
    }
  }

  return (
    <SettingsCard>
      <SectionHeader
        icon={ServerIcon}
        eyebrow="SYSTEM"
        title="システム"
        description="アプリケーションとバージョンの管理"
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">バージョン</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              access-control-system
            </p>
          </div>
          <span className="rounded-md border border-cyan-500/30 bg-cyan-500/5 px-2.5 py-1 font-mono text-xs text-cyan-700 dark:text-cyan-300">
            v{version ?? "—"}
          </span>
        </div>

        {/* 危険区域 */}
        <div className="rounded-lg border border-rose-300/60 bg-rose-50/50 p-4 dark:border-rose-500/25 dark:bg-rose-500/5">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-rose-500 dark:text-rose-400">
            danger zone
          </p>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                シェルに戻る
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                アプリを終了し、起動前のシェル画面に戻ります
              </p>
            </div>

            {isConfirmingExit ? (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmingExit(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleExitToShell}
                  className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-400"
                >
                  終了する
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingExit(true)}
                className="shrink-0 rounded-lg border border-rose-300 px-3.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
              >
                終了
              </button>
            )}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
