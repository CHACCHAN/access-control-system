import { useEffect, useRef, useState, type RefObject } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CameraStatus } from "./useCamera";

interface UseNativeCameraFeedResult {
  /** 表示先の canvas(useNativeCameraFeed がフレームを描画する) */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  status: CameraStatus;
  error: string | null;
}

const CAMERA_RESTART_DELAY_MS = 5000;

// StrictModeのsetup→cleanup→setupを含め、同じWebViewからのカメラ関連IPC
// (受信チャンネル登録・start/stop)を必ず発行順に完了させる。チャンネル登録を
// このキューの外で行うと、再マウント時に「古いマウントの登録が新しい登録を
// 追い越して上書きし、フレームが二度と届かない」レースが起こり得る。
// Boot診断側もstop完了をawaitしてから本画面へ進む。
let cameraLifecycleQueue: Promise<void> = Promise.resolve();

function enqueueCameraIpc(operation: () => Promise<void>): Promise<void> {
  const run = cameraLifecycleQueue.then(operation);
  cameraLifecycleQueue = run.catch(() => {});
  return run;
}

/**
 * WebKitGTK 経由の getUserMedia() がこのキオスク環境(PipeWire 未整備)では
 * 機能しないため、Rust 側が v4l2 から取得・JPEG 化したフレームを Tauri Channel
 * 経由の**バイナリ(ArrayBuffer)のまま**受け取り、createImageBitmap で
 * デコードして canvas に描画するフック。
 *
 * 旧方式(base64 文字列の Tauri イベント + <img> のダブルバッファ)は、
 * フレームごとに base64 エンコード(Rust)→ JSON 文字列化 → base64 デコード
 * (WebView)が走り CPU 負荷が大きかった。Channel の Raw 送信は IPC の
 * カスタムプロトコルでバイナリのまま届き、canvas への drawImage は描画準備
 * 済みのビットマップを一括転送するため、点滅対策のダブルバッファも不要になる。
 *
 * 検出処理(呼び出し側)がフレーム到着ペースより遅くても古いフレームが
 * 溜まらないよう、常に「最後に届いたフレームだけ」を適用する。
 */
export function useNativeCameraFeed(): UseNativeCameraFeedResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const latestFrameRef = useRef<ArrayBuffer | null>(null);
  const appliedFrameRef = useRef<ArrayBuffer | null>(null);
  const applyingRef = useRef(false);
  const streamingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unlistenError: UnlistenFn | undefined;
    let restartTimer: number | null = null;
    latestFrameRef.current = null;
    appliedFrameRef.current = null;
    streamingRef.current = false;
    setError(null);

    async function applyLatestFrame() {
      if (applyingRef.current) return;
      applyingRef.current = true;
      try {
        // デコード中に次のフレームが届いても、ここでは追わずに最新値だけ
        // 見るループにすることで、古いフレームの適用を自然に読み飛ばす。
        while (!cancelled) {
          const frame = latestFrameRef.current;
          const canvas = canvasRef.current;
          if (!frame || !canvas || frame === appliedFrameRef.current) break;
          // デコードに失敗するフレーム(転送途中の破損等)を繰り返し
          // 処理しないよう、成否に関わらず適用済み扱いにして次を待つ。
          appliedFrameRef.current = frame;

          let bitmap: ImageBitmap;
          try {
            bitmap = await createImageBitmap(new Blob([frame], { type: "image/jpeg" }));
          } catch {
            continue;
          }
          if (cancelled) {
            bitmap.close();
            break;
          }
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
          }
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
          bitmap.close();
          if (!streamingRef.current) {
            streamingRef.current = true;
            setError(null);
            setStatus("streaming");
          }
        }
      } finally {
        applyingRef.current = false;
      }
    }

    function scheduleRestart() {
      if (cancelled || restartTimer !== null) return;
      restartTimer = window.setTimeout(() => {
        restartTimer = null;
        if (cancelled) return;
        setStatus("requesting");
        void enqueueCameraIpc(() => invoke<void>("stop_camera_capture"))
          .then(() => enqueueCameraIpc(() => invoke<void>("start_camera_capture")))
          .catch((err) => {
            if (cancelled) return;
            setError(err instanceof Error ? err.message : String(err));
            setStatus("error");
            scheduleRestart();
          });
      }, CAMERA_RESTART_DELAY_MS);
    }

    async function start() {
      setStatus("requesting");
      try {
        const stopListeningErrors = await listen<string>("camera-error", (event) => {
          if (cancelled) return;
          setError(event.payload);
          setStatus("error");
          streamingRef.current = false;
          scheduleRestart();
        });
        if (cancelled) {
          stopListeningErrors();
          return;
        }
        unlistenError = stopListeningErrors;

        // 受信チャンネルをキャプチャ開始前に登録し、最初のフレームから受け取る。
        // 再マウント時は新しいチャンネルで Rust 側の登録が上書きされる。
        // 登録もキュー経由にして、他マウントの登録・start/stop と順序が
        // 入れ替わらないようにする。
        const frameChannel = new Channel<ArrayBuffer>();
        frameChannel.onmessage = (frame) => {
          if (cancelled) return;
          latestFrameRef.current = frame;
          void applyLatestFrame();
        };
        await enqueueCameraIpc(() =>
          invoke<void>("set_camera_frame_channel", { channel: frameChannel }),
        );
        if (cancelled) return;

        await enqueueCameraIpc(() => invoke<void>("start_camera_capture"));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
        // 稼働中のエラー(camera-error)と同様、初回の開始失敗も自動で
        // 再起動を試みる(無人キオスクでの自己復旧)。
        scheduleRestart();
      }
    }

    start();

    return () => {
      cancelled = true;
      unlistenError?.();
      if (restartTimer !== null) window.clearTimeout(restartTimer);
      void enqueueCameraIpc(() => invoke<void>("stop_camera_capture")).catch(() => {});
    };
  }, []);

  return { canvasRef, status, error };
}
