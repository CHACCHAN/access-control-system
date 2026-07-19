import { useEffect, useRef, useState } from "react";
import { isAttendanceStatus, type AttendanceStatus } from "@/entities/member/model";
import { useSettings } from "@/shared/hooks/useSettings";
import { detectGesture, type GestureKind } from "@/shared/lib/visionApi";

/** 確定済みジェスチャーの送信までのカウントダウン表示状態。 */
export interface GestureCountdownState {
  /** カウントダウンの引き金になったジェスチャー */
  gesture: GestureKind;
  /** カウント完了時に記録する在室ステータス */
  status: AttendanceStatus;
  /** 残り秒数(3→2→1)。0 になった時点で送信される */
  secondsLeft: number;
  /** 設定されたカウントダウン全体の秒数(進捗リング描画用) */
  totalSeconds: number;
}

interface UseGestureStatusLoopParams {
  /** ポーリングを行うか(対象画面が表示されている間だけ true にする) */
  active: boolean;
  /** ジェスチャーが確定し(カウントダウンがあれば完了し)たときに、割り当てステータスで呼ばれる */
  onStatus: (status: AttendanceStatus) => void;
  /** 「ちがう」ジェスチャー(設定 rejectGesture)が安定検出されたときに呼ばれる */
  onReject?: () => void;
  /**
   * このステータスへの更新は発火しない(対象メンバーの現在のステータスを渡す)。
   * ガイドの淡色表示と対応し、無意味なカウントダウン・送信を始めない。
   */
  unavailableStatus?: string | null;
}

interface UseGestureStatusLoopResult {
  /** 直近の検出ジェスチャー(手が写っていなければ null)。ガイドのハイライト用 */
  detectedGesture: GestureKind | null;
  /** 送信までのカウントダウン(未実施中は null)。UI がアニメーション表示に使う */
  countdown: GestureCountdownState | null;
}

// カウントダウン中にジェスチャーが観測できなかった場合の許容回数。
// 1回の取りこぼし(検出のちらつき)ではキャンセルせず、連続したらキャンセルする。
const COUNTDOWN_MISS_TOLERANCE = 2;

/**
 * Rust側のジェスチャー認識(detect_gesture)をポーリングし、設定でステータスが
 * 割り当てられたジェスチャーが安定して検出されたら onStatus を呼ぶ共有フック。
 * 在室ステータス操作シートと顔認証の確認カードの両方から使う。
 *
 * `gestureCountdownSeconds` が 1 以上のときは、確定後すぐに送信せず
 * カウントダウン(3→2→1)を挟む。カウント中に手を下ろす・別のジェスチャーに
 * 変えるとキャンセルされる(誤認識時の取り消し猶予)。
 *
 * 注意: 呼び出し側は送信中(POST中)も `active` を維持し、コールバック側で
 * 多重実行を弾くこと。送信のたびに active を落とすと、発火済みガードの
 * リセット(このフックは activate 時に行う)と衝突して再送ループになり得る。
 */
export function useGestureStatusLoop({
  active,
  onStatus,
  onReject,
  unavailableStatus = null,
}: UseGestureStatusLoopParams): UseGestureStatusLoopResult {
  const { settings } = useSettings();
  const gesturePollIntervalMs = Math.max(200, settings.performance.gesturePollIntervalMs || 700);
  // 誤爆防止: 同じジェスチャーがこの回数連続したときだけステータスを確定する。
  // 0・負値・NaN は回数条件なし(1回の一致で確定)として扱う。
  const gestureStableCount = Math.max(
    1,
    Math.round(settings.performance.gestureStableCount) || 1,
  );
  const requiredStreak = gestureStableCount;
  const rejectGesture = settings.rejectGesture;
  const countdownSeconds = settings.gestureCountdownSeconds;

  const [detectedGesture, setDetectedGesture] = useState<GestureKind | null>(null);
  const [countdown, setCountdown] = useState<GestureCountdownState | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const onRejectRef = useRef(onReject);
  onRejectRef.current = onReject;
  // 発火済みのジェスチャー。同じ手を出し続けている間は再発火しない(連続POST防止)。
  // 手を下ろす/Unknown、または「別のジェスチャーへ切り替えた」ときに解除される。
  const firedGestureRef = useRef<GestureKind | null>(null);

  useEffect(() => {
    if (!active) {
      setDetectedGesture(null);
      setCountdown(null);
      return;
    }

    // 新しい操作セッション(確認カード・操作シートが開くたび)ごとに発火済み
    // 状態をリセットする。ループ停止中に手を下ろしてもここでは観測できないため、
    // 前セッションの発火を持ち越すと「同じジェスチャーが二度と送信されない」
    // 状態になる(ガイドはハイライトされるのに送信されないバグの原因)。
    firedGestureRef.current = null;
    setCountdown(null);

    let cancelled = false;
    let inFlight = false;
    let errorLogged = false;
    let consecutiveErrors = 0;
    // 「確定したのに送信できない」状況を設定→ログで特定できるよう、
    // ブロック理由の記録は理由が変わったときだけ1回にする(ログを埋めない)
    let lastBlockLogged: string | null = null;
    let lastGesture: GestureKind | null = null;
    let streak = 0;
    // 送信待ちカウントダウン。ポーリングとは独立した1秒タイマーで進め、
    // ポーリング側は「同じジェスチャーが出続けているか」の監視だけを行う。
    let pending: { gesture: GestureKind; status: AttendanceStatus } | null = null;
    let pendingMisses = 0;
    let countdownTimer: number | null = null;

    const cancelCountdown = () => {
      if (countdownTimer !== null) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
      }
      pending = null;
      pendingMisses = 0;
      setCountdown(null);
    };

    const fire = (gesture: GestureKind, status: AttendanceStatus) => {
      firedGestureRef.current = gesture;
      console.info(`[gesture] 送信: ${gesture} → ${status}(手を下ろすまで再送信しません)`);
      onStatusRef.current(status);
    };

    const startCountdown = (gesture: GestureKind, status: AttendanceStatus) => {
      pending = { gesture, status };
      pendingMisses = 0;
      let secondsLeft = countdownSeconds;
      console.info(`[gesture] 確定: ${gesture} → ${status}(${countdownSeconds}秒カウントダウン)`);
      setCountdown({ gesture, status, secondsLeft, totalSeconds: countdownSeconds });
      countdownTimer = window.setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft > 0) {
          setCountdown({ gesture, status, secondsLeft, totalSeconds: countdownSeconds });
          return;
        }
        cancelCountdown();
        fire(gesture, status);
      }, 1000);
    };

    const timer = window.setInterval(async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const result = await detectGesture();
        if (cancelled) return;
        errorLogged = false;
        consecutiveErrors = 0;
        const gesture = result.handDetected ? result.gesture : null;
        setDetectedGesture(gesture);

        // カウントダウン中は「同じジェスチャーを出し続けているか」だけを監視する。
        // 検出の一時的なちらつきは許容し、連続で途切れたらキャンセルして
        // 通常の判定へ戻る(手を下ろす・別の手に変える = 取り消し)。
        if (pending) {
          if (gesture === pending.gesture) {
            pendingMisses = 0;
          } else {
            pendingMisses += 1;
            if (pendingMisses >= COUNTDOWN_MISS_TOLERANCE) {
              console.info("[gesture] カウントダウンをキャンセル(手が離れた/変わった)");
              cancelCountdown();
              lastGesture = null;
              streak = 0;
            }
          }
          return;
        }

        // 手なし/Unknown で発火済み状態を解除し、次の操作を受け付ける
        if (!result.handDetected || result.gesture === "Unknown") {
          firedGestureRef.current = null;
          lastGesture = null;
          streak = 0;
          lastBlockLogged = null;
          return;
        }

        // 発火済みと同じ手を出し続けている間はPOSTを繰り返さない。
        // ただし「別のジェスチャーへ切り替えた」場合は手を下ろさなくても
        // 発火済み状態を解除し、新しいジェスチャーとして判定を再開する。
        if (result.gesture === firedGestureRef.current) {
          lastGesture = result.gesture;
          streak = 0;
          return;
        }
        firedGestureRef.current = null;

        if (result.gesture === lastGesture) {
          streak += 1;
        } else {
          streak = 1;
        }
        lastGesture = result.gesture;

        // 「ちがう」ジェスチャー(サムズダウン等)。ステータス割り当てとは独立に
        // 判定し、確認カードを閉じるだけの操作なのでカウントダウンは挟まない。
        if (
          streak >= requiredStreak &&
          rejectGesture !== "" &&
          result.gesture === rejectGesture
        ) {
          streak = 0;
          firedGestureRef.current = result.gesture;
          onRejectRef.current?.();
          return;
        }

        if (streak >= requiredStreak) {
          // 確定に至ったのに送信しないケースは、理由を設定→ログへ残す
          // (実機で「反応するのに送信されない」を切り分けるため)
          if (!result.roomStatus || !isAttendanceStatus(result.roomStatus)) {
            const reason = `${result.gesture}:no-status`;
            if (lastBlockLogged !== reason) {
              lastBlockLogged = reason;
              console.warn(
                `[gesture] ${result.gesture} を確定しましたが、割り当てステータスが不正のため送信しません: ${String(result.roomStatus)}`,
              );
            }
            return;
          }
          // 現在と同じステータスへの更新は行わない(ガイドの淡色表示と対応)。
          // ここで弾くことで、送信されないカウントダウンを表示しない。
          if (result.roomStatus === unavailableStatus) {
            const reason = `${result.gesture}:same-status`;
            if (lastBlockLogged !== reason) {
              lastBlockLogged = reason;
              console.info(
                `[gesture] ${result.gesture} → ${result.roomStatus} は現在のステータスと同じため送信しません`,
              );
            }
            return;
          }
          lastBlockLogged = null;
          streak = 0;
          if (countdownSeconds <= 0) {
            fire(result.gesture, result.roomStatus);
          } else {
            startCountdown(result.gesture, result.roomStatus);
          }
        }
      } catch (err) {
        // カメラフレーム未取得・ブラウザ単体実行など。ログを埋めないよう1回だけ記録
        if (!errorLogged) {
          errorLogged = true;
          console.error("[gesture] 認識エラー:", err);
        }
        if (cancelled) return;
        // 認識が動いていないのに直前のハイライトが残ると「検出しているのに
        // 送信されない」ように見えるため、エラーが続いたら表示も消す
        consecutiveErrors += 1;
        if (consecutiveErrors >= COUNTDOWN_MISS_TOLERANCE) setDetectedGesture(null);
        // 検出できない間はジェスチャー継続も確認できないため、取りこぼしと同じ扱い
        if (pending) {
          pendingMisses += 1;
          if (pendingMisses >= COUNTDOWN_MISS_TOLERANCE) cancelCountdown();
        }
      } finally {
        inFlight = false;
      }
    }, gesturePollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (countdownTimer !== null) window.clearInterval(countdownTimer);
    };
  }, [
    active,
    gesturePollIntervalMs,
    gestureStableCount,
    rejectGesture,
    countdownSeconds,
    unavailableStatus,
  ]);

  return { detectedGesture, countdown };
}
