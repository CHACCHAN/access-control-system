import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/shared/hooks/useSettings";

// 「だんだん」暗くする演出にかける時間と、操作復帰時の速さ(スリープではなく、
// 画面全体を覆う黒いレイヤーの不透明度を徐々に上げることで表現している)
const DIM_DURATION_MS = 12000;
const WAKE_DURATION_MS = 400;
const WAKE_EVENTS = ["pointerdown", "mousemove", "keydown", "touchstart"] as const;

function currentHHMM(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * 設定した時刻になると画面を徐々に真っ暗にする。ユーザー操作(マウス・タッチ・
 * キー入力)があれば即座に復帰する。HH:MM は日をまたいで毎日同じ値になるため、
 * 「その日のうちに一度発火したか」を日付込みのキーで管理し、翌日また
 * 発火できるようにしている。
 */
export function ScreenDimmer() {
  const { settings } = useSettings();
  const [isDimmed, setIsDimmed] = useState(false);
  const lastFiredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    function checkSchedule() {
      if (!settings.screenOffSchedule) return;
      const now = new Date();
      const hhmm = currentHHMM(now);
      if (hhmm !== settings.screenOffSchedule) return;

      const fireKey = `${now.toDateString()}_${hhmm}`;
      if (lastFiredKeyRef.current === fireKey) return;
      lastFiredKeyRef.current = fireKey;
      setIsDimmed(true);
    }

    const timer = window.setInterval(checkSchedule, 60_000);
    return () => window.clearInterval(timer);
  }, [settings.screenOffSchedule]);

  useEffect(() => {
    if (!isDimmed) return;

    function wake() {
      setIsDimmed(false);
    }

    WAKE_EVENTS.forEach((event) => window.addEventListener(event, wake));
    return () => {
      WAKE_EVENTS.forEach((event) => window.removeEventListener(event, wake));
    };
  }, [isDimmed]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-200 bg-black transition-opacity ease-linear ${
        isDimmed ? "opacity-100" : "opacity-0"
      }`}
      style={{ transitionDuration: `${isDimmed ? DIM_DURATION_MS : WAKE_DURATION_MS}ms` }}
    />
  );
}
