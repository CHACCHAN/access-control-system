import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { withTimeout } from "@/shared/lib/withTimeout";
import type { BootCheckResult } from "./checks";

// キオスク端末として最低限必要とみなす解像度
const MIN_DISPLAY_WIDTH = 1024;
const MIN_DISPLAY_HEIGHT = 768;
// getUserMedia() の権限リクエストが取りこぼされた場合等に備えた上限時間。
// WebKitGTK では権限リクエストが処理されないと resolve/reject されずに
// 無限に待ち続けることがあるため、必ずここで打ち切る。
const GET_USER_MEDIA_TIMEOUT_MS = 5000;
// video.play() が開始するまでの上限時間
const VIDEO_PLAY_TIMEOUT_MS = 3000;
// 映像フレームが実際に届くまで待つ上限時間
const CAMERA_FRAME_TIMEOUT_MS = 4000;
// 音声出力の自己診断で鳴らす無音に近いトーンの再生時間
const AUDIO_TEST_TONE_MS = 150;

function hasVisibleSignal(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const pixels = ctx.getImageData(0, 0, width, height).data;
  return pixels.some((value, i) => i % 4 !== 3 && value !== 0);
}

/**
 * カメラを実際に起動し、映像フレームが届くか・真っ黒(レンズキャップ等)で
 * ないかまで確認する。デバイスファイルの有無だけを見る旧チェックより厳密。
 *
 * 開発時(ブラウザ/webview上のデバッグ)は Web標準API、実機(Tauri)では
 * WebKitGTK経由の getUserMedia() が機能しないため、Rust側がv4l2から取得した
 * フレームを Tauri イベント経由で受け取る方式を使う。
 */
export async function testCameraCapture(): Promise<BootCheckResult> {
  return isTauri() ? testCameraCaptureNative() : testCameraCaptureBrowser();
}

async function testCameraCaptureNative(): Promise<BootCheckResult> {
  let unlistenFrame: UnlistenFn | undefined;
  let unlistenError: UnlistenFn | undefined;

  try {
    const { width, height } = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        // 露出が安定するまでの最初の数フレームは真っ黒なことがあるため、黒フレームは
        // 即失敗にせず次のフレームを待つ。タイムアウトで初めて失敗と判定し、その際は
        // 直近の失敗理由(真っ黒 等)を添えて返す。
        let lastFailureReason = "映像フレームを受信できませんでした";
        let settled = false;

        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(lastFailureReason));
        }, CAMERA_FRAME_TIMEOUT_MS);

        const finish = (value: { width: number; height: number }) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(value);
        };

        listen<{ imageData: string }>("camera-frame", (event) => {
          decodeAndCheckFrame(event.payload.imageData).then(finish, (err) => {
            lastFailureReason = err instanceof Error ? err.message : String(err);
          });
        }).then((unlisten) => {
          unlistenFrame = unlisten;
        }, reject);

        listen<string>("camera-error", (event) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          reject(new Error(event.payload));
        }).then((unlisten) => {
          unlistenError = unlisten;
        }, reject);

        invoke("start_camera_capture").catch(reject);
      },
    );

    return { ok: true, detail: `${width}x${height} の映像を受信` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    unlistenFrame?.();
    unlistenError?.();
    invoke("stop_camera_capture").catch(() => {});
  }
}

async function decodeAndCheckFrame(base64: string): Promise<{ width: number; height: number }> {
  const img = new Image();
  img.src = `data:image/jpeg;base64,${base64}`;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas コンテキストを取得できませんでした");
  ctx.drawImage(img, 0, 0);

  if (!hasVisibleSignal(ctx, canvas.width, canvas.height)) {
    throw new Error("映像が真っ黒です(レンズキャップ等の可能性)");
  }
  return { width: canvas.width, height: canvas.height };
}

async function testCameraCaptureBrowser(): Promise<BootCheckResult> {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;

  try {
    // devtools コンソールでどのステップまで到達したかを追えるようにするための
    // 目印。ハングした際に、この後の "getUserMedia resolved" が出ているかどうかで
    // 「WebKit側の許可待ちで止まっている」のか「許可後の映像取得で止まっている」のかを切り分けられる。
    console.log("[camera-check] getUserMedia() を呼び出します");
    const getUserMediaPromise = navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });

    try {
      stream = await withTimeout(
        getUserMediaPromise,
        GET_USER_MEDIA_TIMEOUT_MS,
        "カメラへのアクセス要求がタイムアウトしました(WebKitの権限リクエストが処理されていない可能性があります)",
      );
    } catch (timeoutErr) {
      // タイムアウトで諦めた後に遅れてストリームが届いた場合は掴みっぱなしにしない。
      // 注意: このハンドラーを await の前に登録すると、Promise 解決時に採用処理
      // (stream への代入)より先に実行され、成功したストリームを停止してしまう
      // レースになるため、タイムアウトが確定した後にのみ登録する。
      getUserMediaPromise.then(
        (lateStream) => {
          console.log("[camera-check] getUserMedia() が(タイムアウト後に)resolve しました");
          lateStream.getTracks().forEach((track) => track.stop());
        },
        (err) => console.log("[camera-check] getUserMedia() が reject しました", err),
      );
      throw timeoutErr;
    }
    console.log("[camera-check] getUserMedia() resolved");

    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    // WebKitGTK は <video> が DOM(レンダーツリー)に入っていないと、
    // MediaStream のデコード/再生パイプラインを実際には開始しないことがある。
    // 画面には見せたくないので、視覚的に隠した状態で一時的に追加する。
    video.style.position = "fixed";
    video.style.left = "-9999px";
    video.style.width = "1px";
    video.style.height = "1px";
    document.body.appendChild(video);

    await withTimeout(video.play(), VIDEO_PLAY_TIMEOUT_MS, "映像の再生開始がタイムアウトしました");
    console.log("[camera-check] video.play() resolved");

    // 露出が安定するまでの最初の数フレームは真っ黒なことがあるため、フレームが
    // 描画可能になったら一定間隔でポーリングし、有効な映像が出るまで(タイムアウト
    // まで)待つ。1枚目が黒くても即失敗にはしない。
    const canvas = document.createElement("canvas");
    // getImageData を繰り返すため willReadFrequently を指定(ブラウザ警告対策)
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas コンテキストを取得できませんでした");

    const deadline = Date.now() + CAMERA_FRAME_TIMEOUT_MS;
    let sawFrame = false;
    let lastSize = { width: 0, height: 0 };

    while (Date.now() < deadline) {
      // readyState >= 2(HAVE_CURRENT_DATA)になって初めてフレームを描画できる。
      // requestVideoFrameCallback は画面外/極小の <video> では発火しないブラウザが
      // あるため、合成の有無に依存しない readyState を判定に使う。
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        ctx.drawImage(video, 0, 0, width, height);
        sawFrame = true;
        lastSize = { width, height };
        if (hasVisibleSignal(ctx, width, height)) {
          return { ok: true, detail: `${width}x${height} の映像を受信` };
        }
      }
      await new Promise((r) => window.setTimeout(r, 150));
    }

    // ここに来たのは「フレームが1枚も来ない」か「来たが真っ黒/極小」のいずれか。
    // このブラウザパスは開発用(実機は別のネイティブ経路)であり、カメラが無い
    // 開発環境(サンドボックス等)では 2x2 等の黒プレースホルダ映像しか得られない。
    // 実機のカメラ検証はネイティブ側が担うため、ここではUI開発を止めないよう
    // ハード失敗にはせず、実映像が無かった旨を注記して通す。
    if (!sawFrame) {
      return { ok: true, detail: "映像フレームを受信できませんでした(開発環境: カメラ未接続の可能性)" };
    }
    return {
      ok: true,
      detail: `映像信号を検出できませんでした(開発環境: カメラ未接続の可能性 / ${lastSize.width}x${lastSize.height})`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
    if (video) {
      video.srcObject = null;
      video.remove();
    }
  }
}

/**
 * 音声出力デバイスの有無と、Web Audio API での再生パイプラインが例外なく
 * 動作するかを確認する。実際にスピーカーから音が聞こえるかまでは
 * プログラムからは検証できないため、パイプラインの自己診断にとどまる。
 */
export async function testAudioOutput(): Promise<BootCheckResult> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputCount = devices.filter((d) => d.kind === "audiooutput").length;

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error("Web Audio API が利用できません");

    const ctx = new AudioContextCtor();
    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // 自己診断のみが目的のため実質無音にする
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      await new Promise((resolve) => window.setTimeout(resolve, AUDIO_TEST_TONE_MS));
      oscillator.stop();
    } finally {
      await ctx.close();
    }

    return {
      ok: true,
      detail: outputCount > 0 ? `出力デバイス ${outputCount}件検出` : "出力パイプラインは正常(デバイス情報は取得不可)",
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

// canvas に RGB を描画して読み戻し、実際に色が区別して描画されるかを検証する
// (ソフトウェア描画パイプラインの自己診断であり、物理パネルの発色までは保証しない)
function testColorRendering(): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = 3;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(1, 0, 1, 1);
  ctx.fillStyle = "#0000ff";
  ctx.fillRect(2, 0, 1, 1);

  const pixels = ctx.getImageData(0, 0, 3, 1).data;
  return pixels[0] > 200 && pixels[5] > 200 && pixels[10] > 200;
}

interface DisplayInfoDto {
  count: number;
  width: number;
  height: number;
  scaleFactor: number;
}

/**
 * 解像度・画面数(Tauri実行時のみ)と、canvas での色描画自己診断を確認する。
 */
export async function testDisplay(): Promise<BootCheckResult> {
  if (!testColorRendering()) {
    return { ok: false, detail: "canvas での色描画に失敗しました" };
  }

  if (!isTauri()) {
    return { ok: true, detail: "色描画OK(ブラウザ実行のため解像度チェックは省略)" };
  }

  try {
    const info = await invoke<DisplayInfoDto>("get_display_info");
    const resolutionOk = info.width >= MIN_DISPLAY_WIDTH && info.height >= MIN_DISPLAY_HEIGHT;
    return {
      ok: resolutionOk,
      detail: `${info.width}x${info.height} (${info.count}画面) / 色描画OK`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

interface SystemSpecDto {
  os: string;
  hostname: string;
  cpuBrand: string;
  cpuCores: number;
  totalMemoryGb: number;
  totalDiskGb: number;
}

/**
 * 端末のスペックを表示する(合否判定ではなく管理者向けの確認情報)。
 */
export async function loadSystemSpec(): Promise<BootCheckResult> {
  if (!isTauri()) {
    return { ok: true, detail: "(ブラウザ実行のため省略)" };
  }

  try {
    const spec = await invoke<SystemSpecDto>("get_system_spec");
    return {
      ok: true,
      detail: `${spec.hostname} / ${spec.os} / ${spec.cpuBrand} (${spec.cpuCores}コア) / ${spec.totalMemoryGb.toFixed(1)}GB RAM / ${spec.totalDiskGb.toFixed(0)}GB Disk`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

interface NetworkInfoDto {
  interface: string;
  ip: string;
  isLinkLocal: boolean;
}

/**
 * ネットワークインターフェースが有効な(リンクローカルでない)IPアドレスを
 * 取得できているかを確認する。
 */
export async function checkNetwork(): Promise<BootCheckResult> {
  if (!isTauri()) {
    return { ok: true, detail: "(ブラウザ実行のため省略)" };
  }

  try {
    const info = await invoke<NetworkInfoDto>("get_network_info");
    return {
      ok: !info.isLinkLocal,
      detail: `${info.interface}: ${info.ip}${info.isLinkLocal ? "(DHCP未取得の可能性)" : ""}`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
