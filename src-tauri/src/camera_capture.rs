// WebKitGTK(Linux 版 Tauri の webview)は getUserMedia() 経由のカメラ取得が
// この端末(PipeWire 未整備のミニマル startx キオスク環境)では機能しない
// ことが判明したため、v4l2 を直接叩いてフレームを取得してフロントエンドへ渡す
// 代替経路を提供する。表示フレームは Tauri Channel へ JPEG バイナリのまま送り
// (base64 文字列イベントの JSON 化・二重デコードを避ける)、エラー通知のみ
// 低頻度な `camera-error` イベントを使う。
use image::codecs::jpeg::JpegEncoder;
use nokhwa::{
    pixel_format::RgbFormat,
    utils::{
        ApiBackend, CameraFormat, FrameFormat, RequestedFormat, RequestedFormatType, Resolution,
    },
    Camera,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, State};

use crate::vision::OverlayState;

// フレーム間隔と JPEG 品質は設定(settings.json の performance)で調整できる。
// 既定値は crate::settings::PerfSettings::default() を参照。
const CAPTURE_WIDTH: u32 = 640;
const CAPTURE_HEIGHT: u32 = 480;
// カメラ(特に FaceTime HD 等)は open_stream() 直後の数フレームが真っ黒や
// 露出未調整で返ってくることがあるため、最初の数フレームは捨てて自動露出が
// 落ち着くのを待つ。捨てている間のフレーム取得エラーも無視する。
const WARMUP_FRAMES: u32 = 8;
// 一過性の v4l2 エラーで無人キオスクが復帰不能にならないよう、連続で
// この回数失敗するまではキャプチャを継続する(単発の失敗は握りつぶす)。
const MAX_CONSECUTIVE_ERRORS: u32 = 15;
// キャプチャ中もこの間隔でパフォーマンス設定を読み直し、送信間隔・JPEG品質の
// 変更をカメラを掴み直さずに反映する(設定保存→端末再起動を待たずに効くようにする)。
const PERF_RELOAD_INTERVAL: Duration = Duration::from_secs(2);
// 配信停止中(画面消灯中)のデコード間隔。消灯中は人感復帰ウォッチャー
// (1.5秒間隔のポーリング)だけがフレームを読むため、毎フレームの MJPEG→RGB
// デコードは不要。この間隔まで間引いて消灯中の CPU 使用率・発熱を抑える。
const PAUSED_DECODE_INTERVAL: Duration = Duration::from_millis(500);

/// 推論(顔認証・ジェスチャー認識)用に共有する最新のデコード済みフレーム。
/// フロントへ送る JPEG とは別に、キャプチャスレッドが毎フレーム上書きする。
/// 推論側はフロントの表示ペースと独立に「その時点の最新フレーム」を読む。
pub struct LatestFrame {
    pub width: u32,
    pub height: u32,
    /// RGB24 (len = width * height * 3)
    pub rgb: Arc<[u8]>,
    pub captured_at: Instant,
}

#[derive(Default, Clone)]
pub struct SharedFrame(pub Arc<Mutex<Option<LatestFrame>>>);

struct CaptureHandle {
    stop_flag: Arc<AtomicBool>,
    join_handle: JoinHandle<()>,
}

#[derive(Default)]
struct CameraCaptureInner {
    handle: Mutex<Option<CaptureHandle>>,
    /// 画面消灯中はフロントへの配信(JPEG化・送信)を止め、デコードも間引く。
    /// 推論用の SharedFrame 更新(間引き後)と人感復帰は影響を受けない。
    emit_paused: AtomicBool,
    /// 表示フレーム(JPEG バイナリ)の送信先チャンネル。WebView 側が
    /// `set_camera_frame_channel` で登録し、リロード・再マウント時は新しい
    /// チャンネルで上書きされる。未登録の間は表示用の処理自体を省く。
    frame_channel: Mutex<Option<Channel<InvokeResponseBody>>>,
}

/// Arc で包み、コマンド側が spawn_blocking へ clone して渡せるようにする。
/// (stop はキャプチャスレッドの join を伴うため、メインスレッドで実行すると
/// v4l2 が固まった場合に UI 全体がフリーズする)
#[derive(Clone, Default)]
pub struct CameraCaptureState(Arc<CameraCaptureInner>);

#[tauri::command]
pub async fn start_camera_capture(
    app: AppHandle,
    state: State<'_, CameraCaptureState>,
    shared_frame: State<'_, SharedFrame>,
    overlay_state: State<'_, OverlayState>,
) -> Result<(), String> {
    let state = state.inner().clone();
    let shared_frame = shared_frame.inner().clone();
    let overlay = overlay_state.inner().clone();
    // 停止処理が終了待ちで状態ロックを保持している場合にブロックしても、
    // メインスレッド(UI)を巻き込まないようブロッキングスレッドで実行する。
    tauri::async_runtime::spawn_blocking(move || {
        start_capture_blocking(app, &state, shared_frame, overlay)
    })
    .await
    .map_err(|e| format!("カメラ開始タスクが失敗しました: {e}"))?
}

fn start_capture_blocking(
    app: AppHandle,
    state: &CameraCaptureState,
    shared_frame: SharedFrame,
    overlay: OverlayState,
) -> Result<(), String> {
    let mut guard = state
        .0
        .handle
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
    let thread_state = state.0.clone();
    let join_handle = std::thread::spawn(move || {
        run_capture_loop(
            &app,
            &thread_stop_flag,
            &thread_state,
            &shared_frame,
            &overlay,
        )
    });

    *guard = Some(CaptureHandle {
        stop_flag,
        join_handle,
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_camera_capture(state: State<'_, CameraCaptureState>) -> Result<(), String> {
    let state = state.inner().clone();
    // join はカメラ解放(最悪ハング)まで戻らないため、メインスレッドでは行わない。
    tauri::async_runtime::spawn_blocking(move || stop_capture_blocking(&state))
        .await
        .map_err(|e| format!("カメラ停止タスクが失敗しました: {e}"))?
}

fn stop_capture_blocking(state: &CameraCaptureState) -> Result<(), String> {
    let mut guard = state
        .0
        .handle
        .lock()
        .map_err(|_| "内部状態のロックに失敗しました".to_string())?;
    if let Some(handle) = guard.take() {
        handle.stop_flag.store(true, Ordering::SeqCst);
        // 次回起動時に「デバイス使用中」エラーにならないよう、カメラが
        // 実際に解放されるまで(スレッド終了まで)待ってから戻る。
        // join 中も状態ロックを保持し、並行して呼ばれた start が旧カメラの
        // 解放前に新しいキャプチャスレッドを起動しないようにする。
        handle
            .join_handle
            .join()
            .map_err(|_| "カメラキャプチャスレッドが異常終了しました".to_string())?;
    }
    Ok(())
}

/// フロントの映像受信チャンネルを登録する。表示フレームは base64 イベントでは
/// なくこの Channel へ JPEG バイナリ(Raw)のまま送ることで、IPC の JSON 文字列化と
/// base64 エンコード/デコード(Rust・WebView の両側)を省き、CPU 負荷を抑える。
/// キャプチャの開始・停止(start/stop_camera_capture)とは独立しており、
/// 先に登録しておけばキャプチャ開始直後のフレームから受信できる。
#[tauri::command]
pub fn set_camera_frame_channel(
    state: State<'_, CameraCaptureState>,
    channel: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let mut guard = state
        .0
        .frame_channel
        .lock()
        .map_err(|_| "内部状態のロックに失敗しました".to_string())?;
    *guard = Some(channel);
    Ok(())
}

/// 画面消灯中のフロント配信を一時停止/再開する(ScreenDimmer から呼ぶ)。
/// 停止中もカメラは掴んだままで、人感復帰用の SharedFrame 更新は間引いて継続する。
#[tauri::command]
pub fn set_camera_stream_paused(state: State<'_, CameraCaptureState>, paused: bool) {
    state.0.emit_paused.store(paused, Ordering::SeqCst);
    eprintln!(
        "[camera-capture] フロント配信を{}",
        if paused {
            "一時停止(消灯中の省電力モード)"
        } else {
            "再開"
        }
    );
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

// nokhwa の Linux バックエンドは、カメラを開く際に「デバイスの現在の
// フレーム間隔」を読み、その分子が 1 でないと
// 「Could not get device property V4L2 FrameRate: Framerate not whole number」
// で失敗する(どのフォーマット候補を要求しても通る場所にある)。
// UVC カメラ(iMac の FaceTime HD 等)はドライバがフレーム間隔を
// 29.97fps(1001/30000)や 100ns 単位の生値(333333/10000000)のような
// 分数で報告することがあるため、nokhwa へ渡す前に S_PARM で
// 整数 fps(分子 1)へ正規化しておく。
fn normalize_device_framerate(index: u32) {
    use v4l::video::Capture;

    let Ok(device) = v4l::Device::new(index as usize) else {
        return;
    };
    let Ok(params) = Capture::params(&device) else {
        return;
    };
    let interval = params.interval;
    // 分子 1(整数 fps)なら nokhwa がそのまま受け付ける
    if interval.numerator <= 1 || interval.denominator == 0 {
        return;
    }

    // 現在値に最も近い整数 fps を第一候補に、デバイスが列挙する離散
    // インターバル由来の整数 fps を「現在値に近い順」で続ける
    let current_fps = (f64::from(interval.denominator) / f64::from(interval.numerator))
        .round()
        .max(1.0) as u32;
    let mut candidates = vec![current_fps];
    if let Ok(format) = Capture::format(&device) {
        if let Ok(intervals) =
            Capture::enum_frameintervals(&device, format.fourcc, format.width, format.height)
        {
            let mut listed: Vec<u32> = intervals
                .iter()
                .filter_map(|fi| match &fi.interval {
                    v4l::frameinterval::FrameIntervalEnum::Discrete(f) if f.numerator > 0 => {
                        let fps =
                            (f64::from(f.denominator) / f64::from(f.numerator)).round() as u32;
                        (fps > 0).then_some(fps)
                    }
                    _ => None,
                })
                .collect();
            listed.sort_by_key(|fps| u32::abs_diff(*fps, current_fps));
            candidates.extend(listed);
        }
    }
    candidates.dedup();

    for fps in candidates {
        if Capture::set_params(&device, &v4l::video::capture::Parameters::with_fps(fps)).is_err() {
            continue;
        }
        // ドライバが丸めた実際の値を読み直し、分子 1 になったことを確認する
        if let Ok(applied) = Capture::params(&device) {
            if applied.interval.numerator == 1 && applied.interval.denominator > 0 {
                eprintln!(
                    "[camera-capture] フレームレートを整数値へ正規化: {}/{} → 1/{}",
                    interval.numerator, interval.denominator, applied.interval.denominator
                );
                return;
            }
        }
    }
    eprintln!(
        "[camera-capture] フレームレートを整数値へ正規化できませんでした(現在 {}/{})。\
         このカメラは nokhwa が開けない可能性があります",
        interval.numerator, interval.denominator
    );
}

fn probe_current_format(index: u32) -> Option<ProbedFormat> {
    use v4l::video::Capture;

    let device = v4l::Device::new(index as usize).ok()?;
    let format = Capture::format(&device).ok()?;
    let fps = Capture::params(&device)
        .ok()
        .and_then(|p| {
            // interval は 1フレームあたりの時間(例: 1/30 秒 → 30fps)。
            // 正規化後も分数表現が残る場合に備え、四捨五入で整数 fps を求める
            if p.interval.numerator == 0 {
                return None;
            }
            let fps = (f64::from(p.interval.denominator) / f64::from(p.interval.numerator))
                .round() as u32;
            (fps > 0).then_some(fps)
        })
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

        // 分数フレームレート(iMac の FaceTime HD 等)のままだと nokhwa が
        // どの候補でも開けないため、開く前に整数 fps へ正規化しておく。
        if let Ok(device_index) = info.index().as_index() {
            normalize_device_framerate(device_index);
        }

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
                    format!(
                        "現在の出力({} {}x{}@{})",
                        p.fourcc, p.width, p.height, p.fps
                    ),
                    RequestedFormat::new::<RgbFormat>(RequestedFormatType::Exact(
                        CameraFormat::new(Resolution::new(p.width, p.height), frame_format, p.fps),
                    )),
                ));
            }
        }

        for (label, requested) in candidates {
            match Camera::new(info.index().clone(), requested) {
                Ok(mut camera) => match camera.open_stream() {
                    Ok(()) => {
                        eprintln!(
                            "[camera-capture] {} を {label} で使用します(実際: {})",
                            info.human_name(),
                            camera.camera_format(),
                        );
                        return Ok(camera);
                    }
                    Err(e) => {
                        eprintln!(
                            "[camera-capture] {} ({label}) のストリームを開始できません: {e}",
                            info.human_name()
                        );
                        last_err = format!("{} ({label}, stream): {e}", info.human_name());
                    }
                },
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

fn run_capture_loop(
    app: &AppHandle,
    stop_flag: &Arc<AtomicBool>,
    capture_state: &Arc<CameraCaptureInner>,
    shared_frame: &SharedFrame,
    overlay: &OverlayState,
) {
    // 設定はキャプチャ開始時に読み、以降は PERF_RELOAD_INTERVAL 間隔で読み直す。
    // これにより送信間隔(fps)・JPEG品質の変更が、カメラを掴み直さずに(端末再起動を
    // 待たずに)反映される。照合パラメータは推論側が毎回読むので従来どおり即時。
    let perf = crate::settings::load_perf(app);
    let mut emit_interval = Duration::from_millis(perf.camera_frame_interval_ms);
    let mut jpeg_quality = perf.camera_jpeg_quality;
    let mut last_perf_reload = Instant::now();
    eprintln!(
        "[camera-capture] 表示フレーム間隔 {}ms / JPEG品質 {}",
        perf.camera_frame_interval_ms, jpeg_quality
    );

    let mut camera = match open_first_available_camera() {
        Ok(camera) => camera,
        Err(e) => {
            let _ = app.emit("camera-error", e);
            return;
        }
    };

    // ウォームアップ:最初の数フレームを捨てる(この間のエラーは無視する)。
    for _ in 0..WARMUP_FRAMES {
        if stop_flag.load(Ordering::SeqCst) {
            return;
        }
        let _ = camera.frame();
    }

    let mut consecutive_capture_errors: u32 = 0;
    let mut consecutive_encode_errors: u32 = 0;
    let mut last_frame_emit: Option<Instant> = None;
    // SharedFrame(推論用)を最後に更新した時刻。配信停止中のデコード間引きに使う。
    let mut last_shared_update: Option<Instant> = None;
    while !stop_flag.load(Ordering::SeqCst) {
        // 設定変更(送信間隔・JPEG品質)を掴み直しなしで反映する。頻繁な store 読み
        // 出しを避けるため一定間隔でのみ読み直す。
        if last_perf_reload.elapsed() >= PERF_RELOAD_INTERVAL {
            last_perf_reload = Instant::now();
            let perf = crate::settings::load_perf(app);
            let new_interval = Duration::from_millis(perf.camera_frame_interval_ms);
            if new_interval != emit_interval || perf.camera_jpeg_quality != jpeg_quality {
                eprintln!(
                    "[camera-capture] 設定を再読込: 表示フレーム間隔 {}ms / JPEG品質 {}",
                    perf.camera_frame_interval_ms, perf.camera_jpeg_quality
                );
                emit_interval = new_interval;
                jpeg_quality = perf.camera_jpeg_quality;
            }
        }

        // カメラからの取得と SharedFrame の更新はデバイスのフレームペースで
        // 継続する。表示用の RGB コピー・JPEG 化・emit だけを設定間隔で間引き、
        // 表示 FPS が推論に使う最新フレームの鮮度に影響しないようにする。
        //
        // 配信停止中(画面消灯中)は emit を行わず、MJPEG→RGB デコードも
        // PAUSED_DECODE_INTERVAL まで間引く(人感復帰ウォッチャーが読む
        // SharedFrame の鮮度はその間隔で十分)。フレーム自体は取得し続けて
        // カメラのストリームは止めない。
        let paused = capture_state.emit_paused.load(Ordering::SeqCst);
        // 受信チャンネル未登録の間は届け先が無いため、表示用コピー・JPEG化ごと省く
        let has_receiver = capture_state
            .frame_channel
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false);
        let should_emit = !paused
            && has_receiver
            && last_frame_emit
                .map(|last| last.elapsed() >= emit_interval)
                .unwrap_or(true);
        let should_decode = !paused
            || last_shared_update
                .map(|last| last.elapsed() >= PAUSED_DECODE_INTERVAL)
                .unwrap_or(true);

        match capture_latest_frame(&mut camera, shared_frame, should_emit, should_decode) {
            Ok(display_frame) => {
                consecutive_capture_errors = 0;
                if should_decode {
                    last_shared_update = Some(Instant::now());
                }

                let Some(display_frame) = display_frame else {
                    continue;
                };
                // エンコード失敗時に毎カメラフレームで再試行して CPU を
                // 使い切らないよう、表示フレームとして選んだ時点で間隔を更新する。
                last_frame_emit = Some(Instant::now());
                match encode_display_frame(display_frame, overlay, jpeg_quality) {
                    Ok(jpeg_bytes) => {
                        consecutive_encode_errors = 0;
                        // 送信失敗(WebView リロード直後の旧チャンネル等)は、次の
                        // チャンネル登録で自然に回復するため握りつぶす。
                        if let Ok(guard) = capture_state.frame_channel.lock() {
                            if let Some(channel) = guard.as_ref() {
                                let _ = channel.send(InvokeResponseBody::Raw(jpeg_bytes));
                            }
                        }
                    }
                    Err(e) => {
                        consecutive_encode_errors += 1;
                        if consecutive_encode_errors >= MAX_CONSECUTIVE_ERRORS {
                            let _ = app.emit(
                                "camera-error",
                                format!(
                                    "表示フレームのエンコードに連続{consecutive_encode_errors}回失敗しました: {e}"
                                ),
                            );
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                consecutive_capture_errors += 1;
                // 連続で規定回数失敗した場合のみ、復帰不能とみなして通知・終了する。
                // それ未満の単発エラーは次のフレームで回復する見込みとして握りつぶす。
                if consecutive_capture_errors >= MAX_CONSECUTIVE_ERRORS {
                    let _ = app.emit(
                        "camera-error",
                        format!(
                            "フレームの取得に連続{consecutive_capture_errors}回失敗しました: {e}"
                        ),
                    );
                    break;
                }
            }
        }
    }
}

struct DisplayFrame {
    width: u32,
    height: u32,
    rgb: Vec<u8>,
}

/// カメラから1フレーム取得し、`decode` のときだけ RGB へデコードして推論用の
/// 最新フレームを更新する(消灯中はデコード自体を間引いて CPU を節約する)。
/// `copy_for_display` のときだけ表示用 RGB を複製し、JPEG エンコードは呼び出し側で行う。
fn capture_latest_frame(
    camera: &mut Camera,
    shared_frame: &SharedFrame,
    copy_for_display: bool,
    decode: bool,
) -> Result<Option<DisplayFrame>, String> {
    let frame = camera.frame().map_err(|e| e.to_string())?;
    if !decode {
        return Ok(None);
    }
    let decoded = frame
        .decode_image::<RgbFormat>()
        .map_err(|e| e.to_string())?;
    let width = decoded.width();
    let height = decoded.height();
    let rgb = decoded.into_raw();
    let display_frame = copy_for_display.then(|| DisplayFrame {
        width,
        height,
        rgb: rgb.clone(),
    });

    // 推論(顔認証・ジェスチャー認識)用には「オーバーレイを描く前」のクリーンな
    // フレームを共有する。オーバーレイ入りのフレームで推論すると精度が落ちるため。
    let mut guard = shared_frame
        .0
        .lock()
        .map_err(|_| "フレーム共有状態のロックに失敗しました".to_string())?;
    *guard = Some(LatestFrame {
        width,
        height,
        rgb: Arc::from(rgb),
        captured_at: Instant::now(),
    });
    Ok(display_frame)
}

fn encode_display_frame(
    mut frame: DisplayFrame,
    overlay: &OverlayState,
    jpeg_quality: u8,
) -> Result<Vec<u8>, String> {
    // フロント表示用フレームには検出結果(顔枠・ランドマーク・手の骨格)を
    // Rust 側で直接焼き込む。フロントは焼き込み済みのフレームを表示するだけ。
    overlay.render(&mut frame.rgb, frame.width as usize, frame.height as usize);

    let img = image::RgbImage::from_raw(frame.width, frame.height, frame.rgb)
        .ok_or("フレームバッファのサイズが不正です")?;
    let mut jpeg_bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg_bytes, jpeg_quality)
        .encode_image(&img)
        .map_err(|e| e.to_string())?;
    Ok(jpeg_bytes)
}
