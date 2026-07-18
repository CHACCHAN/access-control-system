// UI 効果音の再生ユーティリティ。
//
// 実機(Tauri): Rust 側の `play_ui_sound` コマンドで再生する(カメラと同様、
//   メディア処理は Rust に寄せて React とは1本のIOで通信する)。WebKitGTK の
//   HTMLAudioElement はカスタムスキームからのメディア取得や PipeWire 接続の
//   問題で環境により無音になるため使わない。音源(mp3)は Rust バイナリへ
//   埋め込み済み(public/sounds/ と同一ファイル)。
//
// 開発時(ブラウザ): カメラ(getUserMedia)と同様に標準 API を使い、
//   public/sounds/ の mp3 を HTMLAudioElement で再生する。
//
// いずれの経路でも、再生失敗(音声デバイス無し・自動再生制限など)で
// アプリの動作は止めない。
import { invoke, isTauri } from "@tauri-apps/api/core";

export type UiSoundKind = "click" | "hover" | "confirmation" | "success" | "error";

const SOUND_FILE: Record<UiSoundKind, string> = {
  click: "/sounds/click.mp3",
  hover: "/sounds/hover.mp3",
  confirmation: "/sounds/confirmation.mp3",
  success: "/sounds/success.mp3",
  error: "/sounds/error.mp3",
};

// hover は発生頻度が高いので控えめにする(Rust 側 audio.rs と同じ値)
const SOUND_VOLUME: Record<UiSoundKind, number> = {
  click: 0.5,
  hover: 0.25,
  confirmation: 0.55,
  success: 0.6,
  error: 0.6,
};

const cache = new Map<UiSoundKind, HTMLAudioElement>();
// 同じ種類のエラーでログを埋めないよう、記録は種類ごとに1回だけにする
const errorLogged = new Set<string>();

function logOnce(key: string, message: string): void {
  if (errorLogged.has(key)) return;
  errorLogged.add(key);
  console.error(message);
}

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

/** ブラウザ開発時: 標準 Audio API で再生する。 */
function playWithAudioElement(kind: UiSoundKind): void {
  try {
    const audio = getAudio(kind);
    // 連打時は頭出しして即再生し直す(多重生成せず1要素を使い回す)
    audio.currentTime = 0;
    void audio.play().catch((err) => {
      logOnce(
        `play-${kind}`,
        `[uiSound] play failed for ${kind}: ${
          err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        }`,
      );
    });
  } catch (err) {
    logOnce(
      `ctor-${kind}`,
      `[uiSound] audio unavailable for ${kind}: ${
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      }`,
    );
  }
}

export function playUiSound(kind: UiSoundKind): void {
  if (isTauri()) {
    // 実機: Rust 側で再生(デコード・出力とも WebView に依存しない)
    void invoke("play_ui_sound", { kind }).catch((err) => {
      logOnce(`rust-${kind}`, `[uiSound] rust playback failed for ${kind}: ${String(err)}`);
    });
    return;
  }
  playWithAudioElement(kind);
}
