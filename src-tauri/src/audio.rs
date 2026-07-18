// UI 効果音の Rust 側再生。
//
// WebKitGTK の HTMLAudioElement はカスタムスキームからのメディア取得や
// PipeWire 接続の問題で環境によって無音になる(iMac 2013 + Debian 13 で確認)。
// そのためカメラと同様に音声もRust側で処理する: フロントは `play_ui_sound`
// コマンドを1本のIOとして呼ぶだけで、デコード(symphonia)と出力(cpal→ALSA)
// は全て Rust 側で完結する。ブラウザ開発時のみフロントが標準 Audio API を使う。
//
// 音源はビルド時にバイナリへ埋め込む(計約130KB)。public/sounds/ と同一の
// ファイルを参照するため、開発時(ブラウザ)と実機で音源がズレることはない。
use std::io::Cursor;
use std::sync::mpsc::{SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use tauri::State;

use rodio::{Decoder, OutputStreamBuilder, Sink};

/// 音源(mp3)。フロントの public/sounds/ と同じファイルを埋め込む。
const SOUND_CLICK: &[u8] = include_bytes!("../../public/sounds/click.mp3");
const SOUND_HOVER: &[u8] = include_bytes!("../../public/sounds/hover.mp3");
const SOUND_CONFIRMATION: &[u8] = include_bytes!("../../public/sounds/confirmation.mp3");
const SOUND_SUCCESS: &[u8] = include_bytes!("../../public/sounds/success.mp3");
const SOUND_ERROR: &[u8] = include_bytes!("../../public/sounds/error.mp3");

/// 再生要求(音源バイト列と音量)。音量はフロント実装と同じ値
/// (hover は発生頻度が高いので控えめ)。
#[derive(Clone, Copy)]
struct PlayRequest {
    data: &'static [u8],
    volume: f32,
}

fn request_for(kind: &str) -> Option<PlayRequest> {
    let (data, volume) = match kind {
        "click" => (SOUND_CLICK, 0.5),
        "hover" => (SOUND_HOVER, 0.25),
        "confirmation" => (SOUND_CONFIRMATION, 0.55),
        "success" => (SOUND_SUCCESS, 0.6),
        "error" => (SOUND_ERROR, 0.6),
        _ => return None,
    };
    Some(PlayRequest { data, volume })
}

/// 再生スレッドへのチャンネル。OutputStream(cpal)は Send でないため、
/// 専用スレッドが所有し、コマンド側からは要求を送るだけにする。
/// Arc で包み、コマンド側が spawn_blocking へ clone して渡せるようにする
/// (初回のデバイスオープンが遅い環境でもメインスレッド=UIを巻き込まない)。
#[derive(Clone, Default)]
pub struct AudioState(Arc<Mutex<Option<SyncSender<PlayRequest>>>>);

/// 再生スレッドを起動し、要求チャンネルの送信側を返す。
/// 出力デバイスが開けない場合は None(呼び出し側が次回また試す)。
fn spawn_audio_thread() -> Option<SyncSender<PlayRequest>> {
    // 連打で要求が溜まりすぎないよう小さめの有界チャンネルにする
    let (tx, rx) = std::sync::mpsc::sync_channel::<PlayRequest>(16);

    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<bool>();
    std::thread::spawn(move || {
        // ALSA の default デバイスへ出力する(キオスクでは pipewire-alsa 経由)。
        let stream = match OutputStreamBuilder::open_default_stream() {
            Ok(stream) => {
                let _ = ready_tx.send(true);
                stream
            }
            Err(e) => {
                eprintln!("[audio] 音声出力デバイスを開けません: {e}");
                let _ = ready_tx.send(false);
                return;
            }
        };
        eprintln!("[audio] 音声出力スレッドを開始しました");

        while let Ok(request) = rx.recv() {
            let decoder = match Decoder::new(Cursor::new(request.data)) {
                Ok(decoder) => decoder,
                Err(e) => {
                    eprintln!("[audio] mp3 デコードに失敗しました: {e}");
                    continue;
                }
            };
            // Sink ごとに独立して再生されるため、連続クリック等で音が重なっても
            // 前の音を打ち切らない。detach で再生完了までバックグラウンド継続。
            let sink = Sink::connect_new(stream.mixer());
            sink.set_volume(request.volume);
            sink.append(decoder);
            sink.detach();
        }
        eprintln!("[audio] 音声出力スレッドを終了しました");
    });

    // デバイスを開けたかどうかを待ってから返す(失敗即 None で次回再試行へ)
    match ready_rx.recv() {
        Ok(true) => Some(tx),
        _ => None,
    }
}

/// UI 効果音を再生する。未知の kind は無視。デバイスが開けない場合も
/// アプリの動作は止めず、次回呼び出し時に再試行する。
/// 初回(またはスレッド再起動時)のデバイスオープンは ALSA の状態次第で
/// 時間がかかり得るため、ブロッキングスレッドで実行してUIを巻き込まない。
#[tauri::command]
pub async fn play_ui_sound(state: State<'_, AudioState>, kind: String) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || play_blocking(&state, &kind))
        .await
        .map_err(|e| format!("効果音の再生タスクが失敗しました: {e}"))?
}

fn play_blocking(state: &AudioState, kind: &str) -> Result<(), String> {
    let Some(request) = request_for(kind) else {
        return Err(format!("未知の効果音です: {kind}"));
    };

    let mut guard = state
        .0
        .lock()
        .map_err(|_| "音声状態のロックに失敗しました".to_string())?;

    // 初回(または前回失敗・スレッド終了後)は再生スレッドを起動する
    if guard.is_none() {
        *guard = spawn_audio_thread();
    }
    let Some(sender) = guard.as_ref() else {
        // デバイスが無い環境でもエラーにしない(次回また試す)
        return Ok(());
    };

    match sender.try_send(request) {
        Ok(()) => Ok(()),
        Err(TrySendError::Full(_)) => Ok(()), // 溢れた分は間引く(効果音なので問題ない)
        Err(TrySendError::Disconnected(_)) => {
            // スレッドが落ちていたら作り直して1回だけ再試行する
            *guard = spawn_audio_thread();
            if let Some(sender) = guard.as_ref() {
                let _ = sender.try_send(request);
            }
            Ok(())
        }
    }
}
