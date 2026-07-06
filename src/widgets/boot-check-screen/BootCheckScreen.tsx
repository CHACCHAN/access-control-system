import { useEffect } from "react";
import { BOOT_CHECKS } from "./checks";
import { useBootChecks, type BootCheckState } from "./useBootChecks";

interface BootCheckScreenProps {
  onContinue: () => void;
}

const STATE_LABEL: Record<BootCheckState, string> = {
  pending: " .. ",
  ok: " OK ",
  fail: "FAIL",
};

const STATE_CLASSES: Record<BootCheckState, string> = {
  pending: "animate-pulse text-slate-500",
  ok: "text-emerald-400",
  fail: "text-rose-400",
};

export function BootCheckScreen({ onContinue }: BootCheckScreenProps) {
  const { results, isComplete, hasFailure } = useBootChecks(BOOT_CHECKS);

  useEffect(() => {
    if (!isComplete || hasFailure) return;
    const timer = window.setTimeout(onContinue, 500);
    return () => window.clearTimeout(timer);
  }, [isComplete, hasFailure, onContinue]);

  return (
    <div className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-black px-6 font-mono text-sm text-slate-300">
      <div className="w-full max-w-md">
        <p className="mb-4 text-slate-500">システムを起動しています...</p>

        <ul className="space-y-1.5">
          {BOOT_CHECKS.map((check) => {
            const entry = results[check.id];
            return (
              <li key={check.id} className="flex flex-col gap-0.5">
                <div className="flex gap-3">
                  <span className={STATE_CLASSES[entry.state]}>
                    [{STATE_LABEL[entry.state]}]
                  </span>
                  <span>{check.label}</span>
                </div>
                {entry.detail && (
                  <p className="pl-15 text-xs text-slate-500">{entry.detail}</p>
                )}
              </li>
            );
          })}
        </ul>

        {isComplete && hasFailure && (
          <div className="mt-6 animate-fade-in">
            <p className="text-amber-400">
              一部のチェックに失敗しました。続行しますか？
            </p>
            <button
              onClick={onContinue}
              className="mt-3 rounded-full border border-slate-600 px-4 py-1.5 text-slate-200 transition hover:bg-slate-800"
            >
              続行する
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
