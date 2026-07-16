use serde::Serialize;
use std::sync::Mutex;
use std::time::Instant;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, Networks, RefreshKind, System};
use tauri::State;

mod camera_capture;
mod settings;
mod vision;

// バンドル対象が deb (Linux) のみのため systemctl を使う想定
fn run_systemctl(action: &'static str) -> Result<(), String> {
    let status = std::process::Command::new("systemctl")
        .arg(action)
        .status()
        .map_err(|e| format!("systemctl {action} を実行できません: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("systemctl {action} が失敗しました: {status}"))
    }
}

#[tauri::command]
async fn shutdown_computer() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| run_systemctl("poweroff"))
        .await
        .map_err(|e| format!("シャットダウン処理に失敗しました: {e}"))?
}

#[tauri::command]
async fn restart_computer() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| run_systemctl("reboot"))
        .await
        .map_err(|e| format!("再起動処理に失敗しました: {e}"))?
}

// アプリを終了する。startx が本アプリを X セッションの唯一のクライアントとして
// 起動している運用を想定しており、終了すると X セッションごと終わって
// startx 実行前のシェルに戻る。
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// ディスプレイ(モニタ)の解像度・台数の起動時ハードウェアチェック。
// 実際に色が描画できるかどうかはフロントエンド側の canvas 自己診断で補う。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayInfo {
    count: usize,
    width: u32,
    height: u32,
    scale_factor: f64,
}

#[tauri::command]
fn get_display_info(app: tauri::AppHandle) -> Result<DisplayInfo, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary = monitors.first().ok_or("モニタが見つかりません")?;
    let size = primary.size();
    Ok(DisplayInfo {
        count: monitors.len(),
        width: size.width,
        height: size.height,
        scale_factor: primary.scale_factor(),
    })
}

// サーバー(この端末)のスペック確認用。合否判定ではなく、管理者が目視で
// 確認するための情報表示として使う。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemSpec {
    os: String,
    hostname: String,
    cpu_brand: String,
    cpu_cores: usize,
    total_memory_gb: f64,
    total_disk_gb: f64,
}

#[tauri::command]
fn get_system_spec() -> SystemSpec {
    // New_all()/refresh_all() は全プロセスの走査(/proc 全読み)まで行い
    // 重い上にメインスレッドで実行されるため、必要な CPU 一覧とメモリ量だけを
    // 対象にして起動診断を軽くする。
    let sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::nothing())
            .with_memory(MemoryRefreshKind::nothing().with_ram()),
    );

    let cpu_brand = sys
        .cpus()
        .first()
        .map(|cpu| cpu.brand().to_string())
        .filter(|brand| !brand.is_empty())
        .unwrap_or_else(|| "不明".to_string());

    let total_disk_gb = Disks::new_with_refreshed_list()
        .list()
        .iter()
        .map(|disk| disk.total_space())
        .sum::<u64>() as f64
        / 1024f64.powi(3);

    SystemSpec {
        os: System::long_os_version().unwrap_or_else(|| "不明".to_string()),
        hostname: System::host_name().unwrap_or_else(|| "不明".to_string()),
        cpu_brand,
        cpu_cores: sys.cpus().len(),
        total_memory_gb: sys.total_memory() as f64 / 1024f64.powi(3),
        total_disk_gb,
    }
}

// X 側の「自動」消灯を無効化する。
// 画面の消灯・復帰(顔検出による人感復帰を含む)はアプリの ScreenDimmer が
// 担う設計のため、X が勝手にディスプレイを消してしまうと、アプリ側の
// 復帰処理とタイミングが合わず「顔を近づけても復帰しない」状態になる。
// DPMS 拡張そのものは set_display_power の force off/on で使うため無効化せず、
// 自動発動のタイマーだけをゼロにする(xset dpms 0 0 0)。
#[cfg(target_os = "linux")]
fn disable_x_screen_blanking() {
    for args in [
        &["s", "off"][..],
        &["s", "noblank"][..],
        &["dpms", "0", "0", "0"][..],
    ] {
        match std::process::Command::new("xset").args(args).status() {
            Ok(status) if status.success() => {}
            Ok(status) => eprintln!("[display] xset {args:?} が失敗しました: {status}"),
            Err(e) => eprintln!("[display] xset を実行できません: {e}"),
        }
    }
    eprintln!("[display] X の自動消灯を無効化しました(消灯・復帰はアプリが管理)");
}

/// DPMS でディスプレイを強制点灯する。フロントからの復帰(set_display_power)と
/// Rust 側の人感復帰ウォッチャー(vision::start_wake_watch)の両方から使う。
pub fn display_force_on() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let dpms = std::process::Command::new("xset")
            .args(["dpms", "force", "on"])
            .status()
            .map_err(|e| format!("xset を実行できません: {e}"))?;
        if !dpms.success() {
            return Err(format!("xset dpms force on が失敗しました: {dpms}"));
        }
        // スクリーンセーバー側の状態もリセットしておく
        match std::process::Command::new("xset")
            .args(["s", "reset"])
            .status()
        {
            Ok(status) if status.success() => {}
            Ok(status) => eprintln!("[display] xset s reset が失敗しました: {status}"),
            Err(e) => eprintln!("[display] xset s reset を実行できません: {e}"),
        }
    }
    Ok(())
}

// ディスプレイの電源(DPMS)を制御する。
// 自動消灯では黒レイヤーを被せるだけでなく、バックライトごと物理的に消灯して
// ディスプレイの発熱・消費電力を抑える(off)。復帰時は強制点灯する(on)。
#[tauri::command]
fn set_display_power(on: bool) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        if on {
            display_force_on()?;
        } else {
            let status = std::process::Command::new("xset")
                .args(["dpms", "force", "off"])
                .status()
                .map_err(|e| format!("xset を実行できません: {e}"))?;
            if !status.success() {
                return Err(format!("xset dpms force off が失敗しました: {status}"));
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = on;
    Ok(())
}

// スピーカーのハードウェア音量(ALSA ミキサー)を設定する。
// PipeWire 未整備のミニマル startx キオスク環境のため amixer を直接叩く。
// Master が存在しないサウンドカードでは PCM へフォールバックする。
#[tauri::command]
fn set_system_volume(percent: u8) -> Result<(), String> {
    let percent = percent.min(100);
    let mut last_err = String::new();
    for control in ["Master", "PCM"] {
        match std::process::Command::new("amixer")
            .args(["-q", "sset", control, &format!("{percent}%"), "unmute"])
            .status()
        {
            Ok(status) if status.success() => return Ok(()),
            Ok(status) => last_err = format!("amixer sset {control} が失敗しました: {status}"),
            Err(e) => last_err = format!("amixer を実行できません: {e}"),
        }
    }
    Err(format!("音量を設定できませんでした: {last_err}"))
}

// フッターのタスクマネージャ表示用のリアルタイム統計。
// CPU 使用率は「前回リフレッシュからの差分」で算出されるため、System を
// 呼び出しごとに作り直さず管理状態として保持する(初回呼び出しは 0% になるが、
// フロントが数秒間隔でポーリングするため2回目以降は正しい値になる)。
struct StatsInner {
    sys: System,
    networks: Networks,
    last_poll: Instant,
}

#[derive(Default)]
pub struct SystemStatsState(Mutex<Option<StatsInner>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemStats {
    cpu_percent: f32,
    mem_percent: f32,
    mem_used_gb: f64,
    mem_total_gb: f64,
    /// ループバックを除く全インターフェース合算の受信/送信レート(bytes/秒)
    rx_bytes_per_sec: f64,
    tx_bytes_per_sec: f64,
    ip: Option<String>,
}

#[tauri::command]
fn get_system_stats(state: State<SystemStatsState>) -> Result<SystemStats, String> {
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "内部状態のロックに失敗しました".to_string())?;
    let inner = guard.get_or_insert_with(|| StatsInner {
        sys: System::new(),
        networks: Networks::new_with_refreshed_list(),
        last_poll: Instant::now(),
    });

    inner.sys.refresh_cpu_usage();
    inner.sys.refresh_memory();
    inner.networks.refresh(true);

    let elapsed_secs = inner.last_poll.elapsed().as_secs_f64().max(0.001);
    inner.last_poll = Instant::now();

    // received()/transmitted() は「前回リフレッシュからの増分」を返す
    let (mut rx, mut tx) = (0u64, 0u64);
    for (name, data) in inner.networks.iter() {
        if name == "lo" {
            continue;
        }
        rx += data.received();
        tx += data.transmitted();
    }

    let total_mem = inner.sys.total_memory();
    let used_mem = inner.sys.used_memory();

    let ip = if_addrs::get_if_addrs()
        .ok()
        .and_then(|ifaces| {
            ifaces
                .into_iter()
                .find(|iface| !iface.is_loopback() && iface.addr.ip().is_ipv4())
        })
        .map(|iface| iface.addr.ip().to_string());

    Ok(SystemStats {
        cpu_percent: inner.sys.global_cpu_usage(),
        mem_percent: if total_mem > 0 {
            (used_mem as f64 / total_mem as f64 * 100.0) as f32
        } else {
            0.0
        },
        mem_used_gb: used_mem as f64 / 1024f64.powi(3),
        mem_total_gb: total_mem as f64 / 1024f64.powi(3),
        rx_bytes_per_sec: rx as f64 / elapsed_secs,
        tx_bytes_per_sec: tx as f64 / elapsed_secs,
        ip,
    })
}

// ネットワーク疎通確認用。ループバックを除く最初の IPv4 インターフェースを返す。
// リンクローカルアドレス(169.254.x.x 等)しか無い場合は DHCP 未取得とみなす。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkInfo {
    interface: String,
    ip: String,
    is_link_local: bool,
}

#[tauri::command]
fn get_network_info() -> Result<NetworkInfo, String> {
    let interfaces = if_addrs::get_if_addrs().map_err(|e| e.to_string())?;
    interfaces
        .into_iter()
        .find(|iface| !iface.is_loopback() && iface.addr.ip().is_ipv4())
        .map(|iface| NetworkInfo {
            interface: iface.name.clone(),
            ip: iface.addr.ip().to_string(),
            is_link_local: iface.is_link_local(),
        })
        .ok_or_else(|| "有効なネットワークインターフェースが見つかりません".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .manage(camera_capture::CameraCaptureState::default())
        .manage(camera_capture::SharedFrame::default())
        .manage(vision::VisionState::default())
        .manage(vision::OverlayState::default())
        .manage(vision::WakeWatchState::default())
        .manage(SystemStatsState::default())
        .invoke_handler(tauri::generate_handler![
            shutdown_computer,
            restart_computer,
            exit_app,
            get_display_info,
            get_system_spec,
            get_network_info,
            get_system_stats,
            set_system_volume,
            set_display_power,
            camera_capture::start_camera_capture,
            camera_capture::stop_camera_capture,
            camera_capture::set_camera_stream_paused,
            vision::init_vision,
            vision::init_face_vision,
            vision::set_enrolled_faces,
            vision::recognize_face,
            vision::capture_face_embedding,
            vision::detect_gesture,
            vision::start_wake_watch,
            vision::stop_wake_watch
        ])
        .setup(|_app| {
            #[cfg(target_os = "linux")]
            {
                disable_x_screen_blanking();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
