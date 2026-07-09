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

/// 推論(顔認証・ジェスチャー認識)用に共有する最新のデコード済みフレーム。
/// フロントへ送る JPEG とは別に、キャプチャスレッドが毎フレーム上書きする。
/// 推論側はフロントの表示ペースと独立に「その時点の最新フレーム」を読む。
pub struct LatestFrame {
    pub width: u32,
    pub height: u32,
    /// RGB24 (len = width * height * 3)
    pub rgb: Vec<u8>,
    pub captured_at: Instant,
}

#[derive(Default, Clone)]
pub struct SharedFrame(pub Arc<Mutex<Option<LatestFrame>>>);

struct CaptureHandle {
    stop_flag: Arc<AtomicBool>,
    join_handle: JoinHandle<()>,
}

#[derive(Default)]
pub struct CameraCaptureState(Mutex<Option<CaptureHandle>>);

#[tauri::command]
pub fn start_camera_capture(
    app: AppHandle,
    state: State<CameraCaptureState>,
    shared_frame: State<SharedFrame>,
) -> Result<(), String> {
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
    let thread_shared_frame = shared_frame.inner().clone();
    let join_handle =
        std::thread::spawn(move || run_capture_loop(&app, &thread_stop_flag, &thread_shared_frame));

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
fn format_candidates() -> Vec<(String, RequestedFormat<'static>)> {
    let closest = |fmt: FrameFormat| {
        RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(CameraFormat::new(
            Resolution::new(CAPTURE_WIDTH, CAPTURE_HEIGHT),
            fmt,
            30,
        )))
    };
    vec![
        ("MJPEG".to_string(), closest(FrameFormat::MJPEG)),
        ("YUYV".to_string(), closest(FrameFormat::YUYV)),
        ("NV12".to_string(), closest(FrameFormat::NV12)),
        (
            "最高解像度(フォーマット不問)".to_string(),
            RequestedFormat::new::<RgbFormat>(RequestedFormatType::AbsoluteHighestResolution),
        ),
    ]
}

// デバイスが「今」出力しているフォーマットを v4l2 の G_FMT / G_PARM で直接照会する。
// v4l2loopback はフォーマット/フレームレート列挙に正しく応答しないことがあり、
// その場合 nokhwa の列挙ベースの要求(Closest 等)は全滅する。列挙を介さない
// Exact 要求を組み立てるための情報源として使う。
struct ProbedFormat {
    width: u32,
    height: u32,
    fourcc: String,
    fps: u32,
}

fn probe_current_format(index: u32) -> Option<ProbedFormat> {
    use v4l::video::Capture;

    let device = v4l::Device::new(index as usize).ok()?;
    let format = Capture::format(&device).ok()?;
    let fps = Capture::params(&device)
        .ok()
        .and_then(|p| {
            // interval は 1フレームあたりの時間(例: 1/30 秒 → 30fps)
            if p.interval.numerator > 0 {
                Some(p.interval.denominator / p.interval.numerator)
            } else {
                None
            }
        })
        .filter(|fps| *fps > 0)
        .unwrap_or(30);

    Some(ProbedFormat {
        width: format.width,
        height: format.height,
        fourcc: format.fourcc.str().ok()?.trim().to_string(),
        fps,
    })
}

// v4l2 の FourCC 文字列 → nokhwa の FrameFormat(nokhwa がデコードできるもののみ)
fn fourcc_to_frame_format(fourcc: &str) -> Option<FrameFormat> {
    match fourcc {
        "YUYV" => Some(FrameFormat::YUYV),
        "MJPG" => Some(FrameFormat::MJPEG),
        "GREY" => Some(FrameFormat::GRAY),
        "RGB3" => Some(FrameFormat::RAWRGB),
        "BGR3" => Some(FrameFormat::RAWBGR),
        "NV12" => Some(FrameFormat::NV12),
        _ => None,
    }
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
        let mut candidates = format_candidates();

        // 現在の出力フォーマットに完全一致する Exact 要求を最後の砦として足す。
        // Exact はデバイスのフォーマット列挙を参照しない(nokhwa の実装上、要求を
        // そのまま採用してデバイスの現在値と突き合わせるだけ)ため、列挙に正しく
        // 応答しない v4l2loopback でも、現在値と一致していれば必ず開ける。
        let probed = info.index().as_index().ok().and_then(probe_current_format);
        if let Some(p) = &probed {
            eprintln!(
                "[camera-capture] {} の現在の出力: {} {}x{}@{}fps",
                info.human_name(),
                p.fourcc,
                p.width,
                p.height,
                p.fps,
            );
            if let Some(frame_format) = fourcc_to_frame_format(&p.fourcc) {
                candidates.push((
                    format!("現在の出力({} {}x{}@{})", p.fourcc, p.width, p.height, p.fps),
                    RequestedFormat::new::<RgbFormat>(RequestedFormatType::Exact(
                        CameraFormat::new(
                            Resolution::new(p.width, p.height),
                            frame_format,
                            p.fps,
                        ),
                    )),
                ));
            }
        }

        for (label, requested) in candidates {
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

        // どの候補でも開けず、かつ現在の出力がデコード非対応フォーマットだった場合は
        // 原因をそのまま伝える(フィーダー側の設定変更で直せるため)。
        if let Some(p) = &probed {
            if fourcc_to_frame_format(&p.fourcc).is_none() {
                last_err = format!(
                    "{}: 出力フォーマット {} ({}x{}) は未対応です。仮想カメラのフィーダー側を YUYV / MJPG / NV12 等に変更してください",
                    info.human_name(),
                    p.fourcc,
                    p.width,
                    p.height,
                );
            }
        }
    }
    Err(format!("カメラを開けませんでした: {last_err}"))
}

fn run_capture_loop(app: &AppHandle, stop_flag: &Arc<AtomicBool>, shared_frame: &SharedFrame) {
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

        match capture_and_encode_frame(&mut camera, shared_frame) {
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

fn capture_and_encode_frame(
    camera: &mut Camera,
    shared_frame: &SharedFrame,
) -> Result<String, String> {
    use base64::Engine;

    let frame = camera.frame().map_err(|e| e.to_string())?;
    let decoded = frame.decode_image::<RgbFormat>().map_err(|e| e.to_string())?;

    // 推論(顔認証・ジェスチャー認識)用にデコード済みフレームを共有する。
    // ロック中の処理はメモリコピーのみで、推論そのものはここでは行わない
    // (推論はフロントからの Tauri command 契機で別スレッドが実行する)。
    if let Ok(mut guard) = shared_frame.0.lock() {
        *guard = Some(LatestFrame {
            width: decoded.width(),
            height: decoded.height(),
            rgb: decoded.as_raw().clone(),
            captured_at: Instant::now(),
        });
    }

    let mut jpeg_bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg_bytes, JPEG_QUALITY)
        .encode_image(&decoded)
        .map_err(|e| e.to_string())?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes))
}
