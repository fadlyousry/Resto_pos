mod printing;
mod server;
mod storage;
mod updater;

use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use tauri::Manager;

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
