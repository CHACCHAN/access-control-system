import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useSettings } from "@/shared/hooks/useSettings";

// 「だんだん」暗くする演出にかける時間と、操作復帰時の速さ。
// 黒レイヤーのフェードは演出で、フェード完了後は DPMS でディスプレイを
// 物理的に消灯する(バックライトごと切って発熱・消費電力を抑える)。
const DIM_DURATION_MS = 12000;
const WAKE_DURATION_MS = 400;
const WAKE_EVENTS = ["pointerdown", "mousemove", "keydown", "touchstart"] as const;

// フェード完了からディスプレイ電源オフまでの余裕
const POWER_OFF_DELAY_MS = DIM_DURATION_MS + 500;

// 無操作時間のチェック間隔
const IDLE_CHECK_INTERVAL_MS = 10_000;

// Rust 側の人感復帰ウォッチャーが人を検出して画面を点灯したときのイベント
const DISPLAY_WOKEN_EVENT = "display-woken";

// ディスプレイの電源(DPMS)を切り替える。off はバックライトごと物理的に消灯する。
async function setDisplayPower(on: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("set_display_power", { on });
  } catch (err) {
    console.error(`[screen-dimmer] ディスプレイ電源(${on ? "on" : "off"})に失敗:`, err);
  }
}

// Rust 側の人感復帰ウォッチャーの開始/停止(ブラウザ実行では何もしない)
async function invokeQuiet(command: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke(command);
  } catch (err) {
    console.error(`[screen-dimmer] ${command} に失敗:`, err);
  }
}

/**
 * 無操作が設定時間(screenOffMinutes。「時刻」ではなく「時間」)続くと画面を
 * 暗転し、フェード完了後に DPMS でディスプレイを物理的に消灯する(発熱対策)。
 * 0 分は無効。
 *
 * 復帰は2系統:
 * - ユーザー操作(マウス・タッチ・キー入力)→ フロントから物理点灯して解除
 * - 人感復帰 → 消灯中の顔検出は WebView に依存しない Rust 側の
 *   ウォッチャー(start_wake_watch)が行う。DPMS 消灯中は WebView のタイマーが
 *   間引かれることがあり、JS 側のポーリングでは復帰できないため。
 *   Rust が点灯まで済ませ、`display-woken` イベントで黒レイヤーだけ解除する。
 */
export function ScreenDimmer() {
  const { settings } = useSettings();
  const [isDimmed, setIsDimmed] = useState(false);
  const lastActivityRef = useRef(Date.now());
  // イベントリスナー(1度だけ登録)から最新の消灯状態を参照するためのミラー
  const isDimmedRef = useRef(false);
  isDimmedRef.current = isDimmed;

  const screenOffMinutes = settings.screenOffMinutes;

  // ユーザー操作を常時監視して無操作タイマーをリセットする。
  // 消灯中の操作は復帰も兼ねる(黒レイヤーは pointer-events を持たないため
  // イベントは通常どおり届く)。
  useEffect(() => {
    function onActivity() {
      lastActivityRef.current = Date.now();
      if (isDimmedRef.current) {
        // 消灯中の操作 → 物理点灯 + 黒レイヤー解除。
        // (点灯要求は消灯中のみ。mousemove のたびに xset を叩かない)
        void setDisplayPower(true);
        setIsDimmed(false);
      }
    }

    WAKE_EVENTS.forEach((event) => window.addEventListener(event, onActivity));
    return () => {
      WAKE_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, []);

  // Rust 側の人感復帰(画面は既に点灯済み)を受けて黒レイヤーを解除する
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    void listen(DISPLAY_WOKEN_EVENT, () => {
      console.log("[screen-dimmer] 人感復帰(Rust側)を受信");
      lastActivityRef.current = Date.now();
      setIsDimmed(false);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // 無操作が設定時間続いたら暗転する(0 は無効)
  useEffect(() => {
    if (screenOffMinutes <= 0) return;

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= screenOffMinutes * 60_000) {
        setIsDimmed(true);
      }
    }, IDLE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [screenOffMinutes]);

  // 消灯中: Rust 側の人感復帰ウォッチャーを起動し、フェード完了後に
  // ディスプレイを物理消灯する。復帰(解除)時はウォッチャーを停止する。
  // (ウォッチャーは人を検出して点灯した時点で自動終了するが、操作による
  //  復帰の場合はここからの停止が必要)
  useEffect(() => {
    if (!isDimmed) return;

    void invokeQuiet("start_wake_watch");
    const timer = window.setTimeout(() => {
      console.log("[screen-dimmer] フェード完了 → ディスプレイを物理消灯します");
      void setDisplayPower(false);
    }, POWER_OFF_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      void invokeQuiet("stop_wake_watch");
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
