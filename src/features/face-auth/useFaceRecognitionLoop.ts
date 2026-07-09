import { useEffect, useRef, useState, type RefObject } from "react";
import type { Member } from "@/entities/member/api";
import { recognizeFace, type FaceAuthResult } from "@/shared/lib/visionApi";
import type { EnrolledFace } from "./FaceAuthContext";

// 顔がフレーム幅に対してこの比率未満なら「もう少し近づいてください」を出す
const CLOSE_THRESHOLD = 0.32;
// 推論はRust側(i7-3770想定)で数百ms かかるため、過度なポーリングに
// ならない間隔にする。前回の推論が終わるまで次は投げない。
const DETECTION_INTERVAL_MS = 1000;
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
}

interface UseFaceRecognitionLoopResult {
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  hint: FaceScanHint;
  /** Rust側で推論を実行している最中かどうか(「推論中」インジケータ用) */
  isInferring: boolean;
  matchedMember: Member | null;
  dismissMatch: () => void;
}

/**
 * 検出結果(Rustから返るbboxとスコア)をカメラ映像の上に重ねて描画する。
 * canvas のサイズはカメラフレームの実サイズに合わせる(表示はCSSで拡縮)。
 */
function drawDetectionOverlay(
  canvas: HTMLCanvasElement | null,
  result: FaceAuthResult | null,
) {
  if (!canvas) return;

  const width = result?.frameWidth ?? canvas.width;
  const height = result?.frameHeight ?? canvas.height;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!result?.faceDetected || !result.bbox) return;

  const [x, y, boxWidth, boxHeight] = result.bbox;

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, boxWidth, boxHeight);

  const label = result.detScore.toFixed(2);
  ctx.font = "600 13px system-ui, sans-serif";
  const labelWidth = ctx.measureText(label).width + 10;
  const labelY = Math.max(y - 20, 0);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(x, labelY, labelWidth, 18);
  ctx.save();
  ctx.translate(x + 5, labelY + 13);
  // 映像がCSSで左右反転表示されるため、ラベル文字は再反転して読めるようにする
  ctx.scale(-1, 1);
  ctx.textAlign = "right";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/**
 * 一定間隔でRust側の顔認証コマンド(recognize_face)を呼び、結果に応じて
 * ヒント表示・一致メンバーの提示を行うフック。検出・照合の処理自体は
 * 全てRust側で行われ、ここでは結果のハンドリングだけを行う。
 */
export function useFaceRecognitionLoop({
  members,
  enrolledFaces,
  active,
}: UseFaceRecognitionLoopParams): UseFaceRecognitionLoopResult {
  const [hint, setHint] = useState<FaceScanHint>("scanning");
  const [isInferring, setIsInferring] = useState(false);
  const [matchedMember, setMatchedMember] = useState<Member | null>(null);
  const isCheckingRef = useRef(false);
  const missCountRef = useRef(0);
  const errorLoggedRef = useRef(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) {
      drawDetectionOverlay(overlayCanvasRef.current, null);
      missCountRef.current = 0;
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
          `[face-recognition] rust inference took ${elapsedMs.toFixed(0)}ms (interval: ${DETECTION_INTERVAL_MS}ms)`,
        );
        errorLoggedRef.current = false;

        drawDetectionOverlay(overlayCanvasRef.current, result);

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
          setHint("scanning");
          return;
        }

        const closeness = result.bbox[2] / result.frameWidth;
        if (closeness < CLOSE_THRESHOLD) {
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
            missCountRef.current = 0;
            setMatchedMember(member);
            setHint(null);
            return;
          }
        }

        setHint("no-match");
      } catch (err) {
        // カメラフレーム未取得・モデル未ロードなどの一時エラー。連続して
        // 出るとログが埋まるため、状態が変わるまで1回だけ記録する。
        if (!errorLoggedRef.current) {
          errorLoggedRef.current = true;
          console.error("[face-recognition] 推論エラー:", err);
        }
        drawDetectionOverlay(overlayCanvasRef.current, null);
        setHint("scanning");
      } finally {
        isCheckingRef.current = false;
        setIsInferring(false);
      }
    }, DETECTION_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [active, matchedMember, enrolledFaces, members]);

  function dismissMatch() {
    missCountRef.current = 0;
    setMatchedMember(null);
  }

  return { overlayCanvasRef, hint, isInferring, matchedMember, dismissMatch };
}
