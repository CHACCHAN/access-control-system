// UI 効果音の再生ユーティリティ。音源は public/sounds/ の mp3(ビルドで
// dist/sounds/ へコピーされる)。再生失敗(音声デバイス無し・自動再生制限など)で
// アプリの動作を止めないよう、エラーは全て握りつぶす。
export type UiSoundKind = "click" | "hover" | "confirmation" | "success" | "error";

const SOUND_FILE: Record<UiSoundKind, string> = {
  click: "/sounds/click.mp3",
  hover: "/sounds/hover.mp3",
  confirmation: "/sounds/confirmation.mp3",
  success: "/sounds/success.mp3",
  error: "/sounds/error.mp3",
};

// hover は発生頻度が高いので控えめにする
const SOUND_VOLUME: Record<UiSoundKind, number> = {
  click: 0.5,
  hover: 0.25,
  confirmation: 0.55,
  success: 0.6,
  error: 0.6,
};

const cache = new Map<UiSoundKind, HTMLAudioElement>();

function getAudio(kind: UiSoundKind): HTMLAudioElement {
  let audio = cache.get(kind);
  if (!audio) {
    audio = new Audio(SOUND_FILE[kind]);
    audio.preload = "auto";
    audio.volume = SOUND_VOLUME[kind];
    cache.set(kind, audio);
  }
  return audio;
}

export function playUiSound(kind: UiSoundKind): void {
  try {
    const audio = getAudio(kind);
    // 連打時は頭出しして即再生し直す(多重生成せず1要素を使い回す)
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    // Audio 非対応環境でも無視して続行
  }
}
