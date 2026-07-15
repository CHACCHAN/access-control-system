// フロントエンドの設定(tauri-plugin-store の settings.json)のうち、
// Rust 側の処理が参照する項目の読み出しヘルパー。
// キー名と既定値はフロント側 src/shared/hooks/useSettings.ts の
// PerformanceSettings / DEFAULT_PERFORMANCE と揃えること。
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub const SETTINGS_STORE_FILE: &str = "settings.json";
pub const SETTINGS_KEY: &str = "settings";
const PERFORMANCE_KEY: &str = "performance";

/// Rust 側が参照するパフォーマンス設定。設定画面から調整できる。
/// 不正値・未設定の場合は既定値(従来の定数と同じ値)にフォールバックし、
/// 端末が復帰不能にならないよう安全な範囲へクランプする。
pub struct PerfSettings {
    /// フロントへ base64 画像を送るフレーム間隔(ms)。100ms = 10fps
    pub camera_frame_interval_ms: u64,
    /// フロントへ送る JPEG の品質(1-100)
    pub camera_jpeg_quality: u8,
    /// 1:N 照合の類似度閾値(コサイン類似度)
    pub match_threshold: f32,
    /// 1位と2位の類似度差がこれ未満なら誤認識防止のため「該当者なし」にする
    pub match_margin: f32,
    /// 顔がフレーム幅に対してこの比率より小さい場合は照合しない
    pub min_face_width_ratio: f32,
}

impl Default for PerfSettings {
    fn default() -> Self {
        Self {
            camera_frame_interval_ms: 100,
            camera_jpeg_quality: 75,
            match_threshold: 0.5,
            match_margin: 0.05,
            min_face_width_ratio: 0.22,
        }
    }
}

pub fn load_perf(app: &AppHandle) -> PerfSettings {
    let mut perf = PerfSettings::default();

    let Some(obj) = app
        .store(SETTINGS_STORE_FILE)
        .ok()
        .and_then(|store| store.get(SETTINGS_KEY))
        .and_then(|settings| settings.get(PERFORMANCE_KEY).cloned())
    else {
        return perf;
    };

    let read_u64 = |key: &str| obj.get(key).and_then(|v| v.as_u64());
    let read_f32 = |key: &str| obj.get(key).and_then(|v| v.as_f64()).map(|v| v as f32);

    if let Some(v) = read_u64("cameraFrameIntervalMs") {
        // 33ms(約30fps)より速くしても v4l2 側が追従できず、遅すぎると映像が実用にならない
        perf.camera_frame_interval_ms = v.clamp(33, 2_000);
    }
    if let Some(v) = read_u64("cameraJpegQuality") {
        perf.camera_jpeg_quality = v.clamp(10, 100) as u8;
    }
    if let Some(v) = read_f32("matchThreshold") {
        perf.match_threshold = v.clamp(0.1, 0.95);
    }
    if let Some(v) = read_f32("matchMargin") {
        perf.match_margin = v.clamp(0.0, 0.5);
    }
    if let Some(v) = read_f32("minFaceWidthRatio") {
        perf.min_face_width_ratio = v.clamp(0.0, 0.9);
    }
    perf
}
