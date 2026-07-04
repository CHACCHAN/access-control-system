import { useEffect, useState } from "react";

declare global {
  interface Window {
    cv: any;
  }
}

type OpenCvStatus = "loading" | "ready" | "error";

interface UseOpenCvResult {
  cv: any | null;
  status: OpenCvStatus;
  error: string | null;
}

const POLL_INTERVAL_MS = 100;
const TIMEOUT_MS = 30000;

export function useOpenCv(): UseOpenCvResult {
  const [cv, setCv] = useState<any | null>(null);
  const [status, setStatus] = useState<OpenCvStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function clearTimers() {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    }

    function markReady(resolvedCv: any) {
      if (cancelled) return;
      clearTimers();
      setCv(resolvedCv);
      setStatus("ready");
    }

    function markError(message: string) {
      if (cancelled) return;
      clearTimers();
      setError(message);
      setStatus("error");
    }

    async function waitForOpenCv() {
      // window.cv 自体が生成されるまで待つ(script読み込み中はまだ存在しない)
      const cvRoot: any = await new Promise((resolve) => {
        if (window.cv) {
          resolve(window.cv);
          return;
        }
        intervalId = setInterval(() => {
          if (window.cv) {
            if (intervalId) clearInterval(intervalId);
            resolve(window.cv);
          }
        }, POLL_INTERVAL_MS);
      });

      if (cancelled) return;

      // ケース1: window.cv が Promise で公開されている場合
      if (typeof cvRoot.then === "function") {
        const resolvedCv = await cvRoot;
        markReady(resolvedCv);
        return;
      }

      // ケース2: 既に Mat 等が使える状態(初期化済み)
      if (typeof cvRoot.Mat === "function") {
        markReady(cvRoot);
        return;
      }

      // ケース3: オブジェクトは存在するが初期化中 → onRuntimeInitialized を待つ
      cvRoot.onRuntimeInitialized = () => markReady(cvRoot);
    }

    waitForOpenCv().catch((err) => {
      markError(err instanceof Error ? err.message : String(err));
    });

    timeoutId = setTimeout(() => {
      markError("OpenCV.js の読み込みがタイムアウトしました(30秒)");
    }, TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, []);

  return { cv, status, error };
}
