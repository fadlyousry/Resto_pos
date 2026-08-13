mod printing;
mod server;
mod storage;
mod updater;

use serde::{Deserialize, Serialize};
use std::{fs, path::Path, process::Command};
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const NETWORK_CONFIG_FILE: &str = "network-config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NetworkConfig {
    host_server: bool,
    server_url: String,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            host_server: true,
            server_url: format!("http://127.0.0.1:{}", server::SERVER_PORT),
        }
    }
}

#[tauri::command]
fn get_server_info() -> server::ServerInfo {
    server::server_info()
}

#[tauri::command]
fn get_network_config(app: tauri::AppHandle) -> Result<NetworkConfig, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(read_network_config(&directory))
}

#[tauri::command]
fn save_network_config(app: tauri::AppHandle, config: NetworkConfig) -> Result<(), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let serialized = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    fs::write(directory.join(NETWORK_CONFIG_FILE), serialized).map_err(|error| error.to_string())
}

#[tauri::command]
fn exit_application(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_machine_id(app: tauri::AppHandle) -> Result<String, String> {
    let raw_id = hardware_fingerprint_source()
        .or_else(windows_machine_guid)
        .or_else(|| fallback_machine_seed(&app).ok())
        .ok_or_else(|| "تعذر إنشاء معرّف ثابت لهذا الجهاز".to_string())?;
    Ok(format_machine_id(&raw_id))
}

#[cfg(windows)]
fn hardware_fingerprint_source() -> Option<String> {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$product = Get-CimInstance -ClassName Win32_ComputerSystemProduct -Property UUID
$board = Get-CimInstance -ClassName Win32_BaseBoard -Property SerialNumber | Select-Object -First 1
$bios = Get-CimInstance -ClassName Win32_BIOS -Property SerialNumber
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::WriteLine('UUID=' + [string]$product.UUID)
[Console]::WriteLine('BOARD=' + [string]$board.SerialNumber)
[Console]::WriteLine('BIOS=' + [string]$bios.SerialNumber)
"#;
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let content = String::from_utf8_lossy(&output.stdout);
    let mut parts = Vec::new();
    for line in content.lines() {
        let Some((label, value)) = line.split_once('=') else { continue };
        if valid_hardware_value(value) {
            parts.push(format!("{}:{}", label.trim(), value.trim().to_ascii_uppercase()));
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(format!("HW|{}", parts.join("|")))
    }
}

#[cfg(not(windows))]
fn hardware_fingerprint_source() -> Option<String> {
    None
}

fn valid_hardware_value(value: &str) -> bool {
    let normalized = value.trim().to_ascii_uppercase();
    if normalized.len() < 4 {
        return false;
    }
    let compact: String = normalized.chars().filter(|character| character.is_ascii_alphanumeric()).collect();
    if compact.is_empty()
        || compact.chars().all(|character| character == '0')
        || compact.chars().all(|character| character == 'F')
    {
        return false;
    }
    ![
        "TO BE FILLED BY O.E.M.",
        "TO BE FILLED BY OEM",
        "DEFAULT STRING",
        "SYSTEM SERIAL NUMBER",
        "UNKNOWN",
        "NONE",
        "NOT APPLICABLE",
    ]
    .iter()
    .any(|placeholder| normalized.contains(placeholder))
}

#[cfg(windows)]
fn windows_machine_guid() -> Option<String> {
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let output = Command::new("reg.exe")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Cryptography",
            "/v",
            "MachineGuid",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let content = String::from_utf8_lossy(&output.stdout);
    content.lines()
        .find(|line| line.contains("MachineGuid"))
        .and_then(|line| line.split_whitespace().last())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[cfg(not(windows))]
fn windows_machine_guid() -> Option<String> {
    None
}

fn fallback_machine_seed(app: &tauri::AppHandle) -> Result<String, String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let path = directory.join("machine-seed.txt");
    if let Ok(existing) = fs::read_to_string(&path) {
        if !existing.trim().is_empty() {
            return Ok(existing.trim().to_string());
        }
    }
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let seed = uuid::Uuid::new_v4().to_string();
    fs::write(path, &seed).map_err(|error| error.to_string())?;
    Ok(seed)
}

fn format_machine_id(raw: &str) -> String {
    fn fnv1a(value: &[u8], seed: u64) -> u64 {
        value.iter().fold(seed, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        })
    }
    let normalized = raw.trim().to_ascii_uppercase();
    let first = fnv1a(normalized.as_bytes(), 0xcbf29ce484222325);
    let second = fnv1a(normalized.as_bytes(), 0x84222325cbf29ce4);
    let fingerprint = format!("{first:016X}{second:08X}");
    format!(
        "POS-{}-{}-{}",
        &fingerprint[0..8],
        &fingerprint[8..16],
        &fingerprint[16..24]
    )
}

#[tauri::command]
async fn list_printers() -> Result<Vec<printing::PrinterInfo>, String> {
    tauri::async_runtime::spawn_blocking(printing::list_printers)
        .await
        .map_err(|error| format!("تعذر تشغيل خدمة الطابعات: {error}"))?
}

#[tauri::command]
async fn print_receipt(payload: printing::ReceiptPrintPayload) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || printing::print_receipt(payload))
        .await
        .map_err(|error| format!("تعذر تشغيل مهمة الطباعة: {error}"))?
}

#[tauri::command]
async fn print_escpos_receipts(jobs: Vec<printing::EscPosPrintJob>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || printing::print_escpos_receipts(jobs))
        .await
        .map_err(|error| format!("تعذر تشغيل مهمة ESC/POS: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::PendingUpdate::default())
        .invoke_handler(tauri::generate_handler![
            get_server_info,
            get_network_config,
            save_network_config,
            exit_application,
            get_machine_id,
            list_printers,
            print_receipt,
            print_escpos_receipts,
            storage::get_storage_info,
            storage::select_data_directory,
            storage::select_backup_directory,
            storage::save_backup_preferences,
            storage::create_state_backup,
            updater::get_updater_configuration,
            updater::check_for_update,
            updater::install_pending_update
        ])
        .setup(|app| {
            let app_data_directory = app.path().app_data_dir()?;
            if read_network_config(&app_data_directory).host_server {
                let database_path = storage::initialize(app.handle())
                    .map_err(std::io::Error::other)?;
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = server::run(database_path).await {
                        eprintln!("Beitna central server stopped: {error}");
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Beitna POS");
}

fn read_network_config(directory: &Path) -> NetworkConfig {
    fs::read_to_string(directory.join(NETWORK_CONFIG_FILE))
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}
