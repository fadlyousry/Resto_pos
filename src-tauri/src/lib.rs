mod server;

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
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(read_network_config(&directory))
}

#[tauri::command]
fn save_network_config(
    app: tauri::AppHandle,
    config: NetworkConfig,
) -> Result<(), String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let serialized = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    fs::write(directory.join(NETWORK_CONFIG_FILE), serialized)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_server_info,
            get_network_config,
            save_network_config
        ])
        .setup(|app| {
            let app_data_directory = app.path().app_data_dir()?;
            if read_network_config(&app_data_directory).host_server {
                let database_path = app_data_directory.join("beitna.db");
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
