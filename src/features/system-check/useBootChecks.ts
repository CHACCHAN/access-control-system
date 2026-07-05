import { useEffect, useRef, useState } from "react";
import type { BootCheck } from "./checks";

export type BootCheckState = "pending" | "ok" | "fail";

interface UseBootChecksResult {
  results: Record<string, BootCheckState>;
  isComplete: boolean;
  hasFailure: boolean;
}

// 実際の完了が早くても、1件ずつ順番に結果が出る「起動ログ」らしい見た目にするための最小間隔
const REVEAL_STAGGER_MS = 250;

/**
 * 起動チェックを並行して走らせつつ、結果は起動ログ風に1件ずつ順番に反映するフック
 */
export function useBootChecks(checks: BootCheck[]): UseBootChecksResult {
  const [results, setResults] = useState<Record<string, BootCheckState>>(() =>
    Object.fromEntries(checks.map((check) => [check.id, "pending"])),
  );
  const checksRef = useRef(checks);

  useEffect(() => {
    let cancelled = false;

    checksRef.current.forEach((check, index) => {
      const minDelay = new Promise((resolve) =>
        window.setTimeout(resolve, REVEAL_STAGGER_MS * (index + 1)),
      );

      Promise.all([check.run().catch(() => false), minDelay]).then(([ok]) => {
        if (cancelled) return;
        setResults((prev) => ({ ...prev, [check.id]: ok ? "ok" : "fail" }));
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const values = Object.values(results);
  const isComplete = values.every((state) => state !== "pending");
  const hasFailure = values.some((state) => state === "fail");

  return { results, isComplete, hasFailure };
}
