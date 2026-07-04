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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            shutdown_computer,
            restart_computer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
