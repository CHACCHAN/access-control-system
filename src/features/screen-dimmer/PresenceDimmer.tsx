import { useCallback, useEffect, useRef, useState } from "react";

// 顔検出も操作も無い状態がこの時間続いたら半減光する。
// 顔認証の推論間隔(既定1秒)より十分長くし、検出の取りこぼし1〜2回で
// 画面がチラつかないようにする。
const PRESENCE_DIM_AFTER_MS = 10_000;
// 不在判定のチェック間隔
const PRESENCE_CHECK_INTERVAL_MS = 1_000;
// 操作イベント(在席とみなす)。ScreenDimmer の復帰イベントと同じセット。
const PRESENCE_EVENTS = ["pointerdown", "mousemove", "keydown", "touchstart"] as const;

/**
 * 人物不在時の減光(自動消灯とは別の第1段階)。
 *
 * - 在席シグナルは2系統: カメラの顔検出(reportPresence を顔認証ループから呼ぶ)
 *   とユーザー操作(window のイベント)。
 * - どちらも無い状態が PRESENCE_DIM_AFTER_MS 続くと isDim=true(半減光)。
 * - 顔が写る・操作する、のどちらかで即座に復帰する。
 * - 自動消灯(ScreenDimmer)の無操作タイマーには影響しない(独立して動く)。
 */
export function usePresenceDim(enabled: boolean): {
  isDim: boolean;
  reportPresence: () => void;
} {
  const [isDim, setIsDim] = useState(false);
  const lastPresenceRef = useRef(Date.now());

  const reportPresence = useCallback(() => {
    lastPresenceRef.current = Date.now();
    // 同値 setState は React が再レンダーを省略するため、毎秒呼ばれても安価
    setIsDim(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsDim(false);
      return;
    }
    // 有効化(設定変更・外部サイトから復帰など)の時点から測り直す
    lastPresenceRef.current = Date.now();

    PRESENCE_EVENTS.forEach((event) => window.addEventListener(event, reportPresence));
    const timer = window.setInterval(() => {
      if (Date.now() - lastPresenceRef.current >= PRESENCE_DIM_AFTER_MS) {
        setIsDim(true);
      }
    }, PRESENCE_CHECK_INTERVAL_MS);

    return () => {
      PRESENCE_EVENTS.forEach((event) => window.removeEventListener(event, reportPresence));
      window.clearInterval(timer);
    };
  }, [enabled, reportPresence]);

  return { isDim, reportPresence };
}

/**
 * 半減光の黒レイヤー。完全消灯(ScreenDimmer, z-200)より下に重ねる。
 * pointer-events を持たないため、減光中の操作はそのまま下の UI へ届き、
 * そのイベント自体が復帰トリガーになる。
 */
export function PresenceDimOverlay({ isDim }: { isDim: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-150 bg-black transition-opacity ease-out ${
        isDim ? "opacity-55" : "opacity-0"
      }`}
      style={{ transitionDuration: isDim ? "1500ms" : "300ms" }}
    />
  );
}
