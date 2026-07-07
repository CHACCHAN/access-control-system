import { useEffect, useRef, useState } from "react";
import { withTimeout } from "@/shared/lib/withTimeout";

// "unavailable" は「カメラが使えない(が、異常ではない)」状態。実カメラの無い
// 開発環境などで使い、赤いエラーではなく中立的な案内として扱う。
export type CameraStatus = "idle" | "requesting" | "streaming" | "error" | "unavailable";

// WebKitGTK では権限リクエストが取りこぼされると getUserMedia() が
// resolve/reject されずに無限に待ち続けることがあるため、上限時間を設ける。
const GET_USER_MEDIA_TIMEOUT_MS = 5000;
// 仮想カメラ(OBS 等)が未接続時に返す 2x2 等の極小プレースホルダ映像を
// 実映像と区別するためのしきい値。これ未満の解像度は実カメラではないとみなす。
const MIN_REAL_CAMERA_SIZE = 32;
// メタデータ(実解像度)が確定するまで待つ上限時間
const METADATA_TIMEOUT_MS = 3000;

interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
}

/**
 * <video> のメタデータ(実解像度)が確定するまで待つ。getUserMedia 直後は
 * まだ videoWidth/videoHeight が 0 のことがあり、その時点で解像度を判定すると
 * 実カメラを「極小プレースホルダ」と誤判定してしまうため、確定を待ってから見る。
 * タイムアウトした場合はその時点の値で判定を進める(ハングさせない)。
 */
function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("loadedmetadata", done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, METADATA_TIMEOUT_MS);
    video.addEventListener("loadedmetadata", done, { once: true });
  });
}

/**
 * getUserMedia でカメラ映像を取得し、渡された <video> 要素にアタッチするフック。
 * コンポーネントの unmount 時にはストリームを確実に停止する。
 *
 * ブラウザの既定カメラが仮想カメラ(OBS 等)のプレースホルダ映像を返す環境が
 * あるため、既定デバイスが極小映像しか出さない場合は videoinput デバイスを
 * 列挙して順に試し、実映像を返すデバイスを自動採用する。
 *
 * 呼び出し側のコンポーネントは、実際に `<video ref={videoRef}>` を
 * マウントするタイミングになってから初めてこのフックを使うこと(= マウントが
 * 起動トリガーを兼ねる)。取得したストリームは `videoRef.current` に直接代入する
 * だけで React 管理下にないため、video 要素がまだ無い状態で開始すると、映像取得
 * 自体は成功していても(status は "streaming" になるが)画面には何も表示されない。
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    function stopStream(target: MediaStream | null) {
      target?.getTracks().forEach((track) => track.stop());
    }

    async function openStream(deviceId?: string): Promise<MediaStream> {
      const video: MediaTrackConstraints = {
        width: { ideal: 640 },
        height: { ideal: 480 },
      };
      if (deviceId) {
        video.deviceId = { exact: deviceId };
      } else {
        video.facingMode = "user";
      }

      const promise = navigator.mediaDevices.getUserMedia({ video, audio: false });
      try {
        return await withTimeout(
          promise,
          GET_USER_MEDIA_TIMEOUT_MS,
          "カメラへのアクセス要求がタイムアウトしました",
        );
      } catch (err) {
        // タイムアウトで諦めた後に遅れてストリームが届いた場合は掴みっぱなしにしない。
        // 注意: このハンドラーを await の前に登録してはいけない。Promise 解決時に
        // 採用処理(呼び出し側の代入)より先に実行されてしまい、成功したばかりの
        // ストリームを「未採用」と誤判定して停止するレースになる(全カメラが
        // 2x2 の死んだ映像になる実バグの原因だった)。失敗確定後にのみ登録する。
        promise.then(
          (lateStream) => stopStream(lateStream),
          () => {},
        );
        throw err;
      }
    }

    /**
     * 指定デバイス(未指定なら既定)を開いて <video> にアタッチし、実映像
     * (極小プレースホルダでない)が得られたら true。ダメなら閉じて false。
     */
    async function tryDevice(video: HTMLVideoElement, deviceId?: string, label?: string): Promise<boolean> {
      const candidate = await openStream(deviceId);
      if (cancelled) {
        stopStream(candidate);
        return false;
      }
      stream = candidate;
      video.srcObject = candidate;

      // 実カメラかどうかはメタデータ確定後の実解像度(videoWidth/Height)で判定する。
      // getUserMedia 直後の track.getSettings() は解像度が未確定なことがある。
      await waitForVideoMetadata(video);
      if (cancelled) {
        stopStream(candidate);
        return false;
      }

      console.log(
        `[useCamera] ${label ?? deviceId ?? "既定デバイス"}: 実解像度 ${video.videoWidth}x${video.videoHeight}`,
      );
      if (video.videoWidth >= MIN_REAL_CAMERA_SIZE && video.videoHeight >= MIN_REAL_CAMERA_SIZE) {
        return true;
      }

      video.srcObject = null;
      stopStream(candidate);
      stream = null;
      return false;
    }

    async function startCamera() {
      setStatus("requesting");
      try {
        const video = videoRef.current;
        if (!video) {
          // 検証用の <video> がまだ無い場合は best-effort でそのまま streaming に。
          stream = await openStream();
          if (cancelled) {
            stopStream(stream);
            return;
          }
          setStatus("streaming");
          return;
        }

        // まず既定デバイスを試す
        if (await tryDevice(video)) {
          setStatus("streaming");
          return;
        }
        if (cancelled) return;

        // 既定デバイスが極小映像しか返さない場合(仮想カメラが既定になっている等)、
        // 他の videoinput デバイスを列挙して順に試す。直前の getUserMedia で権限が
        // 付与済みのため、この時点ではデバイスのラベルも取得できる。
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        console.log(
          "[useCamera] 検出された videoinput デバイス:",
          cams.map((d) => d.label || d.deviceId),
        );

        for (const cam of cams) {
          if (cancelled) return;
          try {
            if (await tryDevice(video, cam.deviceId, cam.label)) {
              setStatus("streaming");
              return;
            }
          } catch (err) {
            // 使用中(NotReadableError)等はスキップして次のデバイスを試す
            console.log(`[useCamera] ${cam.label || cam.deviceId} の起動に失敗:`, err);
          }
        }

        if (cancelled) return;
        const labels = cams.map((d) => d.label).filter(Boolean).join(", ");
        setError(
          labels
            ? `実映像を返すカメラが見つかりません(検出: ${labels})`
            : "この環境ではカメラを利用できません(開発環境ではカメラ未接続の可能性)",
        );
        setStatus("unavailable");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stopStream(stream);
    };
  }, []);

  return { videoRef, status, error };
}
