import { useEffect, useRef, useState } from "react";
import type { Member } from "@/entities/member/api";
import { recognizeFace } from "@/shared/lib/visionApi";
import { useSettings } from "@/shared/hooks/useSettings";
import type { EnrolledFace } from "./FaceAuthContext";

// 顔がフレーム幅に対してこの比率未満なら「もう少し近づいてください」を出す
const CLOSE_THRESHOLD = 0.32;
// 確認カード表示中にこの回数連続で顔が検出されなければ、離れたとみなして自動的に閉じる
const MISS_STREAK_TO_DISMISS = 2;

export type FaceScanHint =
  | "scanning"
  | "come-closer"
  | "no-match"
  | "no-enrolled"
  | null;

interface UseFaceRecognitionLoopParams {
  members: Member[];
  enrolledFaces: EnrolledFace[];
  active: boolean;
  /**
   * 一致メンバーを確定して確認カードを出すかどうか。顔登録中は false にして、
   * 検出の可視化(Rust がフレームへ描く枠・ランドマーク)だけを走らせる。
   */
  enableMatch?: boolean;
}

interface UseFaceRecognitionLoopResult {
  hint: FaceScanHint;
  /** Rust側で推論を実行している最中かどうか(「推論中」インジケータ用) */
  isInferring: boolean;
  matchedMember: Member | null;
  dismissMatch: () => void;
}

/**
 * 一定間隔でRust側の顔認証コマンド(recognize_face)を呼び、結果に応じて
 * ヒント表示・一致メンバーの提示を行うフック。検出・照合の処理も、検出結果を
 * カメラ映像へ重ねる描画も全てRust側で行う(recognize_face を呼ぶこと自体が
 * Rust側のオーバーレイ更新のトリガーになる)。ここでは結果のハンドリングだけを行う。
 */
export function useFaceRecognitionLoop({
  members,
  enrolledFaces,
  active,
  enableMatch = true,
}: UseFaceRecognitionLoopParams): UseFaceRecognitionLoopResult {
  const { settings } = useSettings();
  // 推論はRust側(i7-3770想定)で数百ms かかるため、過度なポーリングに
  // ならない間隔にする。前回の推論が終わるまで次は投げない。
  const detectionIntervalMs = Math.max(200, settings.performance.recognitionIntervalMs || 1000);
  // 同一人物がこの回数連続で認識されたときだけ確認カードを出す(誤爆防止)
  const stableCount = Math.max(1, Math.round(settings.performance.recognitionStableCount) || 1);

  const [hint, setHint] = useState<FaceScanHint>("scanning");
  const [isInferring, setIsInferring] = useState(false);
  const [matchedMember, setMatchedMember] = useState<Member | null>(null);
  const isCheckingRef = useRef(false);
  const missCountRef = useRef(0);
  // 連続一致カウント(同じ userId が続いた回数)
  const matchStreakRef = useRef<{ userId: string; count: number } | null>(null);
  const errorLoggedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      missCountRef.current = 0;
      matchStreakRef.current = null;
      return;
    }

    const timer = window.setInterval(async () => {
      if (isCheckingRef.current) return;

      isCheckingRef.current = true;
      setIsInferring(true);
      try {
        const startedAt = performance.now();
        const result = await recognizeFace();
        const elapsedMs = performance.now() - startedAt;
        // 検出間隔より処理時間が長いと取りこぼしが増えるため、比較できるようログに残す
        console.log(
          `[face-recognition] rust inference took ${elapsedMs.toFixed(0)}ms (interval: ${detectionIntervalMs}ms)`,
        );
        errorLoggedRef.current = false;

        // 登録中(enableMatch=false)は検出の可視化だけ走らせ、確定はしない
        if (!enableMatch) {
          setHint(result.faceDetected ? null : "scanning");
          return;
        }

        if (matchedMember) {
          // 確認カード表示中は照合をやり直さず、対象が離れたかどうかだけ見る
          if (!result.faceDetected) {
            missCountRef.current += 1;
            if (missCountRef.current >= MISS_STREAK_TO_DISMISS) {
              missCountRef.current = 0;
              setMatchedMember(null);
              setHint("scanning");
            }
          } else {
            missCountRef.current = 0;
          }
          return;
        }

        if (!result.faceDetected || !result.bbox) {
          matchStreakRef.current = null;
          setHint("scanning");
          return;
        }

        const closeness = result.bbox[2] / result.frameWidth;
        if (closeness < CLOSE_THRESHOLD) {
          matchStreakRef.current = null;
          setHint("come-closer");
          return;
        }

        if (enrolledFaces.length === 0) {
          setHint("no-enrolled");
          return;
        }

        if (result.recognized && result.userId) {
          const member = members.find((m) => m.username === result.userId);
          if (member) {
            // 同一人物が設定回数連続で認識されるまでは確定しない(誤爆防止)。
            // 別人に切り替わったらカウントを取り直す。
            const streak = matchStreakRef.current;
            const count = streak?.userId === member.username ? streak.count + 1 : 1;
            matchStreakRef.current = { userId: member.username, count };
            if (count < stableCount) {
              setHint("scanning");
              return;
            }
            matchStreakRef.current = null;
            missCountRef.current = 0;
            setMatchedMember(member);
            setHint(null);
            return;
          }
        }

        matchStreakRef.current = null;
        setHint("no-match");
      } catch (err) {
        // カメラフレーム未取得・モデル未ロードなどの一時エラー。連続して
        // 出るとログが埋まるため、状態が変わるまで1回だけ記録する。
        if (!errorLoggedRef.current) {
          errorLoggedRef.current = true;
          console.error("[face-recognition] 推論エラー:", err);
        }
        setHint("scanning");
      } finally {
        isCheckingRef.current = false;
        setIsInferring(false);
      }
    }, detectionIntervalMs);

    return () => window.clearInterval(timer);
  }, [active, enableMatch, matchedMember, enrolledFaces, members, detectionIntervalMs, stableCount]);

  function dismissMatch() {
    missCountRef.current = 0;
    setMatchedMember(null);
  }

  return { hint, isInferring, matchedMember, dismissMatch };
}
