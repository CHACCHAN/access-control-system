import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * スピーカーのハードウェア音量(ALSA ミキサー)を設定する。
 * ソフトウェア音量(HTMLAudioElement.volume)ではなく端末の実音量を操作する。
 * ブラウザ単体実行では何もしない。失敗してもアプリの動作は止めない。
 */
export async function applyHardwareVolume(percent: number): Promise<void> {
  if (!isTauri()) return;
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  try {
    await invoke("set_system_volume", { percent: clamped });
  } catch (err) {
    console.error("[hardware-volume] 音量設定に失敗:", err);
  }
}
