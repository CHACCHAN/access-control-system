import { useEffect } from "react";
import { useAppVersion } from "@/shared/hooks/useAppVersion";
import { BOOT_CHECKS } from "./checks";
import { useBootChecks, type BootCheckState } from "./useBootChecks";

interface BootCheckScreenProps {
  onContinue: () => void;
}

const STATE_LABEL: Record<BootCheckState, string> = {
  pending: " •• ",
  ok: " OK ",
  fail: "FAIL",
};

const STATE_CLASSES: Record<BootCheckState, string> = {
  pending: "animate-pulse text-slate-500",
  ok: "text-emerald-400",
  fail: "text-rose-400",
};

const DOT_CLASSES: Record<BootCheckState, string> = {
  pending: "bg-slate-600",
  ok: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
  fail: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]",
};

/**
 * 起動診断画面。設定ページと揃えたサイバー/HUD 調のデザインで、各チェックを
 * 起動ログ風に順次表示する。全て成功したら自動でメイン画面へ遷移する。
 */
export function BootCheckScreen({ onContinue }: BootCheckScreenProps) {
  const { results, isComplete, hasFailure } = useBootChecks(BOOT_CHECKS);
  const version = useAppVersion();

  useEffect(() => {
    if (!isComplete || hasFailure) return;
    const timer = window.setTimeout(onContinue, 500);
    return () => window.clearTimeout(timer);
  }, [isComplete, hasFailure, onContinue]);

  const total = BOOT_CHECKS.length;
  const done = BOOT_CHECKS.filter((c) => results[c.id].state !== "pending").length;
  const okCount = BOOT_CHECKS.filter((c) => results[c.id].state === "ok").length;
  const progress = Math.round((done / total) * 100);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#070b14] px-6 pb-7 text-slate-300">
      {/* 背景装飾: 格子 + 上部グロー + 走査線 */}
      <div className="cyber-grid pointer-events-none absolute inset-0 opacity-70" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, var(--color-cyan-400) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-scan absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-400/40 to-transparent" />
      </div>

      {version && (
        <p className="fixed left-5 top-5 font-mono text-xs text-slate-600">v{version}</p>
      )}

      <div className="cyber-corners relative z-10 w-full max-w-lg rounded-xl border border-white/10 bg-slate-900/40 p-8 shadow-2xl backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-cyan-400/70">
              // system boot
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-white">
              起動診断
            </h1>
          </div>
          <span className="font-mono text-sm text-cyan-300">
            {okCount}
            <span className="text-slate-600">/{total}</span>
          </span>
        </div>

        {/* 進捗バー */}
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-cyan-400 shadow-glow-bar transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ul className="mt-6 space-y-2 font-mono text-sm">
          {BOOT_CHECKS.map((check) => {
            const entry = results[check.id];
            return (
              <li key={check.id} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-3">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[entry.state]}`} />
                  <span className={`shrink-0 ${STATE_CLASSES[entry.state]}`}>
                    [{STATE_LABEL[entry.state]}]
                  </span>
                  <span className="text-slate-200">{check.label}</span>
                </div>
                {entry.detail && (
                  <p className="pl-12 text-xs text-slate-500">{entry.detail}</p>
                )}
              </li>
            );
          })}
        </ul>

        {isComplete && hasFailure && (
          <div className="mt-6 animate-fade-in rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-amber-400">
              warning
            </p>
            <p className="mt-1 text-sm text-amber-200/90">
              一部のチェックに失敗しました。続行しますか？
            </p>
            <button
              onClick={onContinue}
              className="mt-3 rounded-lg border border-white/15 px-4 py-1.5 text-sm text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-300"
            >
              続行する
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
