// WebKitGTK(Linux 版 Tauri の webview)は getUserMedia() 経由のカメラ取得が
// この端末(PipeWire 未整備のミニマル startx キオスク環境)では機能しない
// ことが判明したため、v4l2 を直接叩いてフレームを取得し、Tauri イベント
// (`camera-frame` / `camera-error`)でフロントエンドへ渡す代替経路を提供する。
use image::codecs::jpeg::JpegEncoder;
use nokhwa::{
    pixel_format::RgbFormat,
    utils::{
        ApiBackend, CameraFormat, FrameFormat, RequestedFormat, RequestedFormatType, Resolution,
    },
    Camera,
};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const FRAME_INTERVAL: Duration = Duration::from_millis(100);
const CAPTURE_WIDTH: u32 = 640;
const CAPTURE_HEIGHT: u32 = 480;
const JPEG_QUALITY: u8 = 75;
// カメラ(特に FaceTime HD 等)は open_stream() 直後の数フレームが真っ黒や
// 露出未調整で返ってくることがあるため、最初の数フレームは捨てて自動露出が
// 落ち着くのを待つ。捨てている間のフレーム取得エラーも無視する。
const WARMUP_FRAMES: u32 = 8;
// 一過性の v4l2 エラーで無人キオスクが復帰不能にならないよう、連続で
// この回数失敗するまではキャプチャを継続する(単発の失敗は握りつぶす)。
const MAX_CONSECUTIVE_ERRORS: u32 = 15;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CameraFramePayload {
    image_data: String,
}

struct CaptureHandle {
    stop_flag: Arc<AtomicBool>,
    join_handle: JoinHandle<()>,
}

#[derive(Default)]
pub struct CameraCaptureState(Mutex<Option<CaptureHandle>>);

#[tauri::command]
pub fn start_camera_capture(app: AppHandle, state: State<CameraCaptureState>) -> Result<(), String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "内部状態のロックに失敗しました".to_string())?;
    if let Some(handle) = guard.as_ref() {
        if handle.join_handle.is_finished() {
            // 前回のキャプチャスレッドが自己終了(連続エラー等)している場合は、
            // 残骸のハンドルを回収してから下で新規に起動し直す。
            if let Some(old) = guard.take() {
                let _ = old.join_handle.join();
            }
        } else {
            // まだ動作中(多重起動を防ぐ。boot-check と顔認証パネルの両方から
            // 呼ばれても、実際にカメラを掴むのは最初の呼び出しだけにする)
            return Ok(());
        }
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    let thread_stop_flag = stop_flag.clone();
    let join_handle = std::thread::spawn(move || run_capture_loop(&app, &thread_stop_flag));

    *guard = Some(CaptureHandle {
        stop_flag,
        join_handle,
    });
    Ok(())
}

#[tauri::command]
pub fn stop_camera_capture(state: State<CameraCaptureState>) -> Result<(), String> {
    let handle = {
        let mut guard = state
            .0
            .lock()
            .map_err(|_| "内部状態のロックに失敗しました".to_string())?;
        guard.take()
    };

    if let Some(handle) = handle {
        handle.stop_flag.store(true, Ordering::SeqCst);
        // 次回起動時に「デバイス使用中」エラーにならないよう、カメラが
        // 実際に解放されるまで(スレッド終了まで)待ってから戻る。
        let _ = handle.join_handle.join();
    }
    Ok(())
}

// 要求フォーマットの候補。nokhwa の Closest は FrameFormat の完全一致を要求する
// (一致するものが無いと "Failed to Fulfill" で開けない)ため、MJPEG 決め打ちだと
// YUYV しか提供しない仮想カメラ(v4l2loopback 等)で失敗する。実カメラで効率の
// よい MJPEG から順に試し、最後はフォーマット不問の最高解像度にフォールバックする。
fn format_candidates() -> Vec<(&'static str, RequestedFormat<'static>)> {
    let closest = |fmt: FrameFormat| {
        RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(CameraFormat::new(
            Resolution::new(CAPTURE_WIDTH, CAPTURE_HEIGHT),
            fmt,
            30,
        )))
    };
    vec![
        ("MJPEG", closest(FrameFormat::MJPEG)),
        ("YUYV", closest(FrameFormat::YUYV)),
        ("NV12", closest(FrameFormat::NV12)),
        (
            "最高解像度(フォーマット不問)",
            RequestedFormat::new::<RgbFormat>(RequestedFormatType::AbsoluteHighestResolution),
        ),
    ]
}

// システム上のカメラデバイスを列挙し、開けた最初のカメラを返す。
// /dev/video0 を決め打ちにすると、仮想カメラが /dev/video10 として存在する
// VM 環境などで「No such file or directory」で失敗するため、必ず列挙する。
fn open_first_available_camera() -> Result<Camera, String> {
    let devices = nokhwa::query(ApiBackend::Auto)
        .map_err(|e| format!("カメラ一覧の取得に失敗しました: {e}"))?;
    if devices.is_empty() {
        return Err("カメラデバイスが見つかりません".to_string());
    }
    eprintln!(
        "[camera-capture] 検出されたカメラ: {:?}",
        devices.iter().map(|d| d.human_name()).collect::<Vec<_>>()
    );

    let mut last_err = String::new();
    for info in &devices {
        for (label, requested) in format_candidates() {
            match Camera::new(info.index().clone(), requested) {
                Ok(camera) => {
                    eprintln!(
                        "[camera-capture] {} を {label} で使用します(実際: {})",
                        info.human_name(),
                        camera.camera_format(),
                    );
                    return Ok(camera);
                }
                Err(e) => {
                    eprintln!(
                        "[camera-capture] {} ({label}) を開けません: {e}",
                        info.human_name()
                    );
                    last_err = format!("{} ({label}): {e}", info.human_name());
                }
            }
        }
    }
    Err(format!("カメラを開けませんでした: {last_err}"))
}

fn run_capture_loop(app: &AppHandle, stop_flag: &Arc<AtomicBool>) {
    let mut camera = match open_first_available_camera() {
        Ok(camera) => camera,
        Err(e) => {
            let _ = app.emit("camera-error", e);
            return;
        }
    };

    if let Err(e) = camera.open_stream() {
        let _ = app.emit("camera-error", format!("カメラストリームを開始できませんでした: {e}"));
        return;
    }

    // ウォームアップ:最初の数フレームを捨てる(この間のエラーは無視する)。
    for _ in 0..WARMUP_FRAMES {
        if stop_flag.load(Ordering::SeqCst) {
            return;
        }
        let _ = camera.frame();
    }

    let mut consecutive_errors: u32 = 0;
    while !stop_flag.load(Ordering::SeqCst) {
        let loop_start = Instant::now();

        match capture_and_encode_frame(&mut camera) {
            Ok(image_data) => {
                consecutive_errors = 0;
                let _ = app.emit("camera-frame", CameraFramePayload { image_data });
            }
            Err(e) => {
                consecutive_errors += 1;
                // 連続で規定回数失敗した場合のみ、復帰不能とみなして通知・終了する。
                // それ未満の単発エラーは次のフレームで回復する見込みとして握りつぶす。
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                    let _ = app.emit(
                        "camera-error",
                        format!("フレームの取得に連続{consecutive_errors}回失敗しました: {e}"),
                    );
                    break;
                }
            }
        }

        let elapsed = loop_start.elapsed();
        if elapsed < FRAME_INTERVAL {
            std::thread::sleep(FRAME_INTERVAL - elapsed);
        }
    }
}

fn capture_and_encode_frame(camera: &mut Camera) -> Result<String, String> {
    use base64::Engine;

    let frame = camera.frame().map_err(|e| e.to_string())?;
    let decoded = frame.decode_image::<RgbFormat>().map_err(|e| e.to_string())?;

    let mut jpeg_bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg_bytes, JPEG_QUALITY)
        .encode_image(&decoded)
        .map_err(|e| e.to_string())?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes))
}
