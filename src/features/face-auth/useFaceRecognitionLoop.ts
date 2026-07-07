import { useEffect, useRef, useState, type RefObject } from "react";
import * as faceapi from "@vladmandic/face-api";
import type { Member } from "@/entities/member/api";
import type { EnrolledFace, FaceMediaElement } from "./FaceAuthContext";

const MATCH_THRESHOLD = 0.6;
const CLOSE_THRESHOLD = 0.32;
const DETECTION_INTERVAL_MS = 800;
// 確認カード表示中にこの回数連続で顔が検出されなければ、離れたとみなして自動的に閉じる
const MISS_STREAK_TO_DISMISS = 2;
// 検出前に入力画像を縮小したい場合はここに幅(px)を設定する(アスペクト比は維持)。
// 実機のCPU/GPU性能(Intel HD Graphics 4000程度)がボトルネックになる場合に調整する。
// null の場合は縮小せず、カメラ映像をそのまま渡す。
const DETECTION_DOWNSCALE_WIDTH: number | null = null;

export type FaceScanHint =
  | "scanning"
  | "come-closer"
  | "no-match"
  | "no-enrolled"
  | null;

interface UseFaceRecognitionLoopParams {
  mediaRef: RefObject<FaceMediaElement | null>;
  members: Member[];
  enrolledFaces: EnrolledFace[];
  active: boolean;
}

interface UseFaceRecognitionLoopResult {
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  hint: FaceScanHint;
  matchedMember: Member | null;
  dismissMatch: () => void;
}

type FaceDetection = faceapi.WithFaceLandmarks<
  faceapi.WithFaceDetection<object>
>;

function getMediaSize(media: FaceMediaElement): { width: number; height: number } {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight };
  }
  return { width: media.naturalWidth, height: media.naturalHeight };
}

function isMediaReady(media: FaceMediaElement): boolean {
  if (media instanceof HTMLVideoElement) return media.readyState >= 2;
  return media.complete && media.naturalWidth > 0;
}

function drawDetectionOverlay(
  media: FaceMediaElement | null,
  canvas: HTMLCanvasElement | null,
  detection: FaceDetection | null,
) {
  if (!media || !canvas) return;

  const { width, height } = getMediaSize(media);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!detection) return;

  const { x, y, width: boxWidth, height: boxHeight } = detection.detection.box;

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, boxWidth, boxHeight);

  ctx.fillStyle = "rgba(125, 211, 252, 0.9)";
  for (const point of detection.landmarks.positions) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const label = detection.detection.score.toFixed(2);
  ctx.font = "600 13px system-ui, sans-serif";
  const labelWidth = ctx.measureText(label).width + 10;
  const labelY = Math.max(y - 20, 0);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(x, labelY, labelWidth, 18);
  ctx.save();
  ctx.translate(x + 5, labelY + 13);
  ctx.scale(-1, 1);
  ctx.textAlign = "right";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/**
 * カメラ映像から一定間隔で顔を検出し、登録済みの顔特徴ベクトルと照合するフック。
 * 一致したメンバーが見つかると matchedMember をセットしてスキャンを一時停止する。
 */
export function useFaceRecognitionLoop({
  mediaRef,
  members,
  enrolledFaces,
  active,
}: UseFaceRecognitionLoopParams): UseFaceRecognitionLoopResult {
  const [hint, setHint] = useState<FaceScanHint>("scanning");
  const [matchedMember, setMatchedMember] = useState<Member | null>(null);
  const isCheckingRef = useRef(false);
  const missCountRef = useRef(0);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const downscaleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) {
      drawDetectionOverlay(mediaRef.current, overlayCanvasRef.current, null);
      missCountRef.current = 0;
      return;
    }

    const timer = window.setInterval(async () => {
      if (isCheckingRef.current) return;
      const media = mediaRef.current;
      if (!media || !isMediaReady(media)) return;

      isCheckingRef.current = true;
      try {
        const detectionInput = getDetectionInput(media, downscaleCanvasRef);

        const startedAt = performance.now();
        const detection = await faceapi
          .detectSingleFace(detectionInput, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();
        const elapsedMs = performance.now() - startedAt;
        // 検出間隔(DETECTION_INTERVAL_MS)より処理時間が長いと検出が追いつかず
        // 取りこぼしが増えるため、比較できるようログに残す。
        console.log(
          `[face-recognition] detection took ${elapsedMs.toFixed(0)}ms (interval: ${DETECTION_INTERVAL_MS}ms)`,
        );

        drawDetectionOverlay(
          media,
          overlayCanvasRef.current,
          detection ?? null,
        );

        if (matchedMember) {
          // 確認カード表示中は照合をやり直さず、対象が離れたかどうかだけ見る
          if (!detection) {
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

        if (!detection) {
          setHint("scanning");
          return;
        }

        const closeness = detection.detection.box.width / getMediaSize(media).width;
        if (closeness < CLOSE_THRESHOLD) {
          setHint("come-closer");
          return;
        }

        if (enrolledFaces.length === 0) {
          setHint("no-enrolled");
          return;
        }

        let best: { username: string; distance: number } | null = null;
        for (const face of enrolledFaces) {
          const distance = faceapi.euclideanDistance(
            detection.descriptor,
            face.descriptor,
          );
          if (!best || distance < best.distance) {
            best = { username: face.username, distance };
          }
        }

        if (best && best.distance <= MATCH_THRESHOLD) {
          const member = members.find((m) => m.username === best!.username);
          if (member) {
            missCountRef.current = 0;
            setMatchedMember(member);
            setHint(null);
            return;
          }
        }

        setHint("no-match");
      } finally {
        isCheckingRef.current = false;
      }
    }, DETECTION_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [active, matchedMember, enrolledFaces, members, mediaRef]);

  function dismissMatch() {
    missCountRef.current = 0;
    setMatchedMember(null);
  }

  return { overlayCanvasRef, hint, matchedMember, dismissMatch };
}

/**
 * DETECTION_DOWNSCALE_WIDTH が設定されている場合、検出前に縮小した canvas を
 * 使い回して返す。未設定なら media をそのまま返す(余計な描画コストをかけない)。
 */
function getDetectionInput(
  media: FaceMediaElement,
  downscaleCanvasRef: RefObject<HTMLCanvasElement | null>,
): FaceMediaElement | HTMLCanvasElement {
  if (!DETECTION_DOWNSCALE_WIDTH) return media;

  const { width, height } = getMediaSize(media);
  if (!width || !height) return media;

  const scale = DETECTION_DOWNSCALE_WIDTH / width;
  if (scale >= 1) return media;

  if (!downscaleCanvasRef.current) {
    downscaleCanvasRef.current = document.createElement("canvas");
  }
  const canvas = downscaleCanvasRef.current;
  canvas.width = DETECTION_DOWNSCALE_WIDTH;
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return media;
  ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
  return canvas;
}
