use serde::Serialize;
use sysinfo::{Disks, System};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// バンドル対象が deb (Linux) のみのため systemctl を使う想定
#[tauri::command]
fn shutdown_computer() -> Result<(), String> {
    std::process::Command::new("systemctl")
        .arg("poweroff")
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn restart_computer() -> Result<(), String> {
    std::process::Command::new("systemctl")
        .arg("reboot")
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
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
    let mut sys = System::new_all();
    sys.refresh_all();

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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            shutdown_computer,
            restart_computer,
            exit_app,
            get_display_info,
            get_system_spec,
            get_network_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
