import { useEffect, useRef, useState } from "react";
import type { AttendanceStatus } from "@/entities/member/api";
import { ATTENDANCE_STATUSES } from "@/entities/member/statusStyle";
import { useSettings } from "@/shared/hooks/useSettings";
import { detectGesture, type GestureKind } from "@/shared/lib/visionApi";

interface UseGestureStatusLoopParams {
  /** ポーリングを行うか(対象画面が表示されている間だけ true にする) */
  active: boolean;
  /** 同じジェスチャーが設定回数連続したときに、割り当てステータスで呼ばれる */
  onStatus: (status: AttendanceStatus) => void;
  /** 「ちがう」ジェスチャー(設定 rejectGesture)が安定検出されたときに呼ばれる */
  onReject?: () => void;
}

interface UseGestureStatusLoopResult {
  /** 直近の検出ジェスチャー(手が写っていなければ null)。ガイドのハイライト用 */
  detectedGesture: GestureKind | null;
}

/**
 * Rust側のジェスチャー認識(detect_gesture)をポーリングし、設定でステータスが
 * 割り当てられたジェスチャーが安定して検出されたら onStatus を呼ぶ共有フック。
 * 在室ステータス操作シートと顔認証の確認カードの両方から使う。
 */
export function useGestureStatusLoop({
  active,
  onStatus,
  onReject,
}: UseGestureStatusLoopParams): UseGestureStatusLoopResult {
  const { settings } = useSettings();
  const gesturePollIntervalMs = Math.max(200, settings.performance.gesturePollIntervalMs || 700);
  // 誤爆防止: 同じジェスチャーがこの回数連続したときだけステータスを確定する
  const gestureStableCount = Math.max(1, Math.round(settings.performance.gestureStableCount) || 1);
  const rejectGesture = settings.rejectGesture;

  const [detectedGesture, setDetectedGesture] = useState<GestureKind | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const onRejectRef = useRef(onReject);
  onRejectRef.current = onReject;

  useEffect(() => {
    if (!active) {
      setDetectedGesture(null);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let errorLogged = false;
    let lastGesture: GestureKind | null = null;
    let streak = 0;

    const timer = window.setInterval(async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const result = await detectGesture();
        if (cancelled) return;
        errorLogged = false;
        setDetectedGesture(result.handDetected ? result.gesture : null);

        if (result.gesture !== "Unknown" && result.gesture === lastGesture) {
          streak += 1;
        } else {
          streak = 1;
        }
        lastGesture = result.gesture;

        // 「ちがう」ジェスチャー(サムズダウン等)。ステータス割り当てとは独立に判定する
        if (
          streak >= gestureStableCount &&
          rejectGesture !== "" &&
          result.gesture === rejectGesture
        ) {
          streak = 0;
          onRejectRef.current?.();
          return;
        }

        if (
          streak >= gestureStableCount &&
          result.roomStatus &&
          (ATTENDANCE_STATUSES as string[]).includes(result.roomStatus)
        ) {
          streak = 0;
          onStatusRef.current(result.roomStatus as AttendanceStatus);
        }
      } catch (err) {
        // カメラフレーム未取得・ブラウザ単体実行など。ログを埋めないよう1回だけ記録
        if (!errorLogged) {
          errorLogged = true;
          console.error("[gesture] 認識エラー:", err);
        }
      } finally {
        inFlight = false;
      }
    }, gesturePollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, gesturePollIntervalMs, gestureStableCount, rejectGesture]);

  return { detectedGesture };
}
