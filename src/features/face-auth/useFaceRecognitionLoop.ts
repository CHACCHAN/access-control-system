import { useEffect, useRef, useState, type RefObject } from "react";
import type { Member } from "@/entities/member/api";
import { recognizeFace, type FaceAuthResult } from "@/shared/lib/visionApi";
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
 *
 * カメラ映像(img/video)は object-cover でコンテナに合わせて拡大・切り抜き
 * されるため、canvas はコンテナの実表示サイズに合わせ、フレーム座標を
 * object-cover と同じ「大きい方の倍率で拡大して中央寄せ」の変換で表示座標へ
 * 写像してから描く。以前は canvas 自体に object-cover を効かせてフレーム座標の
 * まま描いていたが、環境によって映像とズレるためJS側で座標変換する方式にした。
 */
function drawDetectionOverlay(
  canvas: HTMLCanvasElement | null,
  result: FaceAuthResult | null,
) {
  if (!canvas) return;

  // 表示サイズ(CSSピクセル)。高DPI環境でも滲まないよう内部解像度は dpr 倍にする
  const dpr = window.devicePixelRatio || 1;
  const viewWidth = canvas.clientWidth;
  const viewHeight = canvas.clientHeight;
  if (viewWidth === 0 || viewHeight === 0) return;
  if (canvas.width !== Math.round(viewWidth * dpr) || canvas.height !== Math.round(viewHeight * dpr)) {
    canvas.width = Math.round(viewWidth * dpr);
    canvas.height = Math.round(viewHeight * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewWidth, viewHeight);
  if (!result?.faceDetected || !result.bbox || !result.frameWidth || !result.frameHeight) return;

  // object-cover と同じ変換: 縦横で大きい方の倍率に合わせ、はみ出す分は中央寄せで切れる
  const scale = Math.max(viewWidth / result.frameWidth, viewHeight / result.frameHeight);
  const offsetX = (viewWidth - result.frameWidth * scale) / 2;
  const offsetY = (viewHeight - result.frameHeight * scale) / 2;

  const x = offsetX + result.bbox[0] * scale;
  const y = offsetY + result.bbox[1] * scale;
  const boxWidth = result.bbox[2] * scale;
  const boxHeight = result.bbox[3] * scale;

  // アクセントカラー設定(App.css の --color-cyan-400 差し替え)に追従させる
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--color-cyan-400").trim() ||
    "#38bdf8";

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, boxWidth, boxHeight);

  const label = result.detScore.toFixed(2);
  ctx.font = "600 13px system-ui, sans-serif";
  const labelWidth = ctx.measureText(label).width + 10;
  const labelY = Math.max(y - 20, 0);
  ctx.fillStyle = accent;
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
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) {
      drawDetectionOverlay(overlayCanvasRef.current, null);
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
        drawDetectionOverlay(overlayCanvasRef.current, null);
        setHint("scanning");
      } finally {
        isCheckingRef.current = false;
        setIsInferring(false);
      }
    }, detectionIntervalMs);

    return () => window.clearInterval(timer);
  }, [active, matchedMember, enrolledFaces, members, detectionIntervalMs, stableCount]);

  function dismissMatch() {
    missCountRef.current = 0;
    setMatchedMember(null);
  }

  return { overlayCanvasRef, hint, isInferring, matchedMember, dismissMatch };
}
