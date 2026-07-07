// WebKitGTK(Linux 版 Tauri の webview)は getUserMedia() 経由のカメラ取得が
// この端末(PipeWire 未整備のミニマル startx キオスク環境)では機能しない
// ことが判明したため、v4l2 を直接叩いてフレームを取得し、Tauri イベント
// (`camera-frame` / `camera-error`)でフロントエンドへ渡す代替経路を提供する。
use image::codecs::jpeg::JpegEncoder;
use nokhwa::{
    pixel_format::RgbFormat,
    utils::{CameraFormat, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType, Resolution},
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
    if guard.is_some() {
        // 既に起動中(多重起動を防ぐ。boot-check と顔認証パネルの両方から
        // 呼ばれても、実際にカメラを掴むのは最初の呼び出しだけにする)
        return Ok(());
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

fn run_capture_loop(app: &AppHandle, stop_flag: &Arc<AtomicBool>) {
    let requested = RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(
        CameraFormat::new(
            Resolution::new(CAPTURE_WIDTH, CAPTURE_HEIGHT),
            FrameFormat::MJPEG,
            30,
        ),
    ));

    let mut camera = match Camera::new(CameraIndex::Index(0), requested) {
        Ok(camera) => camera,
        Err(e) => {
            let _ = app.emit("camera-error", format!("カメラを開けませんでした: {e}"));
            return;
        }
    };

    if let Err(e) = camera.open_stream() {
        let _ = app.emit("camera-error", format!("カメラストリームを開始できませんでした: {e}"));
        return;
    }

    while !stop_flag.load(Ordering::SeqCst) {
        let loop_start = Instant::now();

        match capture_and_encode_frame(&mut camera) {
            Ok(image_data) => {
                let _ = app.emit("camera-frame", CameraFramePayload { image_data });
            }
            Err(e) => {
                let _ = app.emit("camera-error", format!("フレームの取得に失敗しました: {e}"));
                break;
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
