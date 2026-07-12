import { useEffect, useRef, useState } from "react";
import type { BootCheck } from "./checks";

export type BootCheckState = "pending" | "ok" | "fail";

export interface BootCheckEntry {
  state: BootCheckState;
  detail?: string;
}

interface UseBootChecksResult {
  results: Record<string, BootCheckEntry>;
  isComplete: boolean;
  hasFailure: boolean;
}

// 実際の完了が早くても、1件ずつ順番に結果が出る「起動ログ」らしい見た目にするための最小間隔
const REVEAL_STAGGER_MS = 250;

// React StrictModeのeffect再実行でも、カメラ取得など副作用を伴う診断そのものは
// 同じアプリ起動中に1度だけ走らせる。再マウント側は同じPromiseを購読する。
const checkRunCache = new WeakMap<BootCheck, Promise<BootCheckEntry>>();

function runCheckOnce(check: BootCheck): Promise<BootCheckEntry> {
  const cached = checkRunCache.get(check);
  if (cached) return cached;
  const run = Promise.resolve()
    .then(() => check.run())
    .then(
      (result) => ({ state: result.ok ? ("ok" as const) : ("fail" as const), detail: result.detail }),
      (err) => ({
        state: "fail" as const,
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  checkRunCache.set(check, run);
  return run;
}

/**
 * 起動チェックを並行して走らせつつ、結果は起動ログ風に1件ずつ順番に反映するフック
 */
export function useBootChecks(checks: BootCheck[]): UseBootChecksResult {
  const [results, setResults] = useState<Record<string, BootCheckEntry>>(() =>
    Object.fromEntries(checks.map((check) => [check.id, { state: "pending" as const }])),
  );
  const checksRef = useRef(checks);

  useEffect(() => {
    let cancelled = false;

    checksRef.current.forEach((check, index) => {
      const minDelay = new Promise((resolve) =>
        window.setTimeout(resolve, REVEAL_STAGGER_MS * (index + 1)),
      );

      Promise.all([
        runCheckOnce(check),
        minDelay,
      ]).then(([entry]) => {
        if (cancelled) return;
        setResults((prev) => ({
          ...prev,
          [check.id]: entry,
        }));
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const values = Object.values(results);
  const isComplete = values.every((entry) => entry.state !== "pending");
  const hasFailure = values.some((entry) => entry.state === "fail");

  return { results, isComplete, hasFailure };
}
