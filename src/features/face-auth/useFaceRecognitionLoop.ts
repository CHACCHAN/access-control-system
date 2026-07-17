import { useEffect, useRef, useState } from "react";
import type { Member } from "@/entities/member/model";
import { recognizeFace } from "@/shared/lib/visionApi";
import { useSettings } from "@/shared/hooks/useSettings";
import type { EnrolledFace } from "./FaceAuthContext";

// 「もう少し近づいてください」を出す顔サイズ比率のフォールバック(設定が壊れていた場合のみ)。
// 実際のしきい値は設定(performance.minFaceWidthRatio)から取る。
const CLOSE_THRESHOLD_FALLBACK = 0.22;
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
  /** 顔が検出されるたびに呼ばれる(人物不在時の減光の在席シグナル用) */
  onFaceSeen?: () => void;
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
  onFaceSeen,
}: UseFaceRecognitionLoopParams): UseFaceRecognitionLoopResult {
  const { settings } = useSettings();
  // 推論はRust側(i7-3770想定)で数百ms かかるため、過度なポーリングに
  // ならない間隔にする。前回の推論が終わるまで次は投げない。
  const detectionIntervalMs = Math.max(200, settings.performance.recognitionIntervalMs || 1000);
  // 同一人物がこの回数連続で認識されたときだけ確認カードを出す(誤爆防止)
  const stableCount = Math.max(1, Math.round(settings.performance.recognitionStableCount) || 1);
  // 顔がフレーム幅に対してこの比率未満なら「もう少し近づいてください」を出す。
  // 設定(照合する最小顔サイズ比率)で調整できる。小さくするほど遠くても認証を試みる。
  const closeThreshold =
    Number.isFinite(settings.performance.minFaceWidthRatio) &&
    settings.performance.minFaceWidthRatio > 0
      ? settings.performance.minFaceWidthRatio
      : CLOSE_THRESHOLD_FALLBACK;

  const [hint, setHint] = useState<FaceScanHint>("scanning");
  const [isInferring, setIsInferring] = useState(false);
  const [matchedMember, setMatchedMember] = useState<Member | null>(null);
  const isCheckingRef = useRef(false);
  const missCountRef = useRef(0);
  // 連続一致カウント(同じ userId が続いた回数)
  const matchStreakRef = useRef<{ userId: string; count: number } | null>(null);
  const errorLoggedRef = useRef(false);
  // 手動否認・記録後、同じ顔が写ったまま即再表示されないよう、一度顔が
  // フレームから外れるまで次の確定を抑止する。
  const awaitingFaceExitRef = useRef(false);
  // ポーリング効果を張り直さずに最新のコールバックを呼ぶためのミラー
  const onFaceSeenRef = useRef(onFaceSeen);
  onFaceSeenRef.current = onFaceSeen;

  useEffect(() => {
    if (enableMatch) return;
    missCountRef.current = 0;
    matchStreakRef.current = null;
    setMatchedMember(null);
  }, [enableMatch]);

  useEffect(() => {
    if (!active) {
      setIsInferring(false);
      missCountRef.current = 0;
      matchStreakRef.current = null;
      return;
    }

    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (isCheckingRef.current) return;

      isCheckingRef.current = true;
      setIsInferring(true);
      try {
        const startedAt = performance.now();
        const result = await recognizeFace({
          // 登録画面は可視化だけ、確認カード中は離脱検出だけでよいため、
          // 高コストなembedding抽出・1:N照合を繰り返さない。
          matchFaces: enableMatch && matchedMember === null,
          includeLandmarks: matchedMember === null,
          // この比率未満の認識結果は下で「近づいて」と破棄するため、Rust側でも
          // ランドマーク・embedding処理へ進ませない。
          minMatchFaceWidthRatio: closeThreshold,
        });
        // active/mode/メンバー一覧が変わった後に届いた旧推論結果をUIへ反映しない。
        if (cancelled) return;
        const elapsedMs = performance.now() - startedAt;
        // 検出間隔より処理時間が長いと取りこぼしが増えるため、比較できるようログに残す
        if (import.meta.env.DEV) {
          console.log(
            `[face-recognition] rust inference took ${elapsedMs.toFixed(0)}ms (interval: ${detectionIntervalMs}ms)`,
          );
        }
        errorLoggedRef.current = false;

        // どのモード(認証・登録・確認カード中)でも、顔が写っていれば
        // 在席シグナルを送る(人物不在時の減光の復帰・抑止用)。
        if (result.faceDetected) onFaceSeenRef.current?.();

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
          awaitingFaceExitRef.current = false;
          matchStreakRef.current = null;
          setHint("scanning");
          return;
        }

        if (awaitingFaceExitRef.current) {
          matchStreakRef.current = null;
          setHint("scanning");
          return;
        }

        const closeness = result.bbox[2] / result.frameWidth;
        if (closeness < closeThreshold) {
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
        if (!cancelled) setIsInferring(false);
      }
    }, detectionIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    active,
    enableMatch,
    matchedMember,
    enrolledFaces,
    members,
    detectionIntervalMs,
    stableCount,
    closeThreshold,
  ]);

  function dismissMatch() {
    missCountRef.current = 0;
    awaitingFaceExitRef.current = true;
    setMatchedMember(null);
    setHint("scanning");
  }

  return { hint, isInferring, matchedMember, dismissMatch };
}
