use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const STORAGE_CONFIG_FILE: &str = "storage-config.json";
const DATABASE_FILE: &str = "beitna.db";
const DEFAULT_BACKUP_FOLDER: &str = "Backups";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StorageConfig {
    pub setup_complete: bool,
    pub data_directory: Option<PathBuf>,
    pub pending_data_directory: Option<PathBuf>,
    pub backup_directory: Option<PathBuf>,
    pub backup_on_startup: bool,
    pub backup_on_close: bool,
    pub backup_interval_minutes: u64,
    pub backup_retention_count: usize,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            setup_complete: false,
            data_directory: None,
            pending_data_directory: None,
            backup_directory: None,
            backup_on_startup: true,
            backup_on_close: true,
            backup_interval_minutes: 60,
            backup_retention_count: 30,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub data_directory: String,
    pub database_path: String,
    pub pending_data_directory: Option<String>,
    pub backup_directory: String,
    pub backup_on_startup: bool,
    pub backup_on_close: bool,
    pub backup_interval_minutes: u64,
    pub backup_retention_count: usize,
    pub last_backup_at_ms: Option<u128>,
    pub backup_count: usize,
    pub requires_restart: bool,
    pub host_server: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreferences {
    pub backup_on_startup: bool,
    pub backup_on_close: bool,
    pub backup_interval_minutes: u64,
    pub backup_retention_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub path: String,
    pub created_at_ms: u128,
}

pub fn initialize(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data).map_err(|error| error.to_string())?;
    let config_file = app_data.join(STORAGE_CONFIG_FILE);
    let is_first_setup = !config_file.exists();
    let mut config = read_config(&app_data);

    if is_first_setup && !config.setup_complete {
        let selected = rfd::FileDialog::new()
            .set_title("اختر مجلد حفظ بيانات Resto POS (يفضل بارتشن غير C)")
            .pick_folder();
        config.setup_complete = true;
        if let Some(directory) = selected {
            config.pending_data_directory = Some(directory);
        }
    }

    activate_pending_directory(&app_data, &mut config)?;
    write_config(&app_data, &config)?;
    let database_path = database_path(&app_data, &config);
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    Ok(database_path)
}

#[tauri::command]
pub fn get_storage_info(app: tauri::AppHandle) -> Result<StorageInfo, String> {
    storage_info(&app)
}

#[tauri::command]
pub fn select_data_directory(app: tauri::AppHandle) -> Result<StorageInfo, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let mut config = read_config(&app_data);
    let current = data_directory(&app_data, &config);
    let selected = rfd::FileDialog::new()
        .set_title("اختر مجلد حفظ بيانات Resto POS")
        .set_directory(&current)
        .pick_folder();
    if let Some(directory) = selected {
        if directory != current {
            config.pending_data_directory = Some(directory);
            write_config(&app_data, &config)?;
        }
    }
    storage_info(&app)
}

#[tauri::command]
pub fn select_backup_directory(app: tauri::AppHandle) -> Result<StorageInfo, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let mut config = read_config(&app_data);
    let current = backup_directory(&app_data, &config);
    let selected = rfd::FileDialog::new()
        .set_title("اختر مجلد النسخ الاحتياطية")
        .set_directory(&current)
        .pick_folder();
    if let Some(directory) = selected {
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        config.backup_directory = Some(directory);
        write_config(&app_data, &config)?;
    }
    storage_info(&app)
}

#[tauri::command]
pub fn save_backup_preferences(
    app: tauri::AppHandle,
    preferences: BackupPreferences,
) -> Result<StorageInfo, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let mut config = read_config(&app_data);
    config.backup_on_startup = preferences.backup_on_startup;
    config.backup_on_close = preferences.backup_on_close;
    config.backup_interval_minutes = preferences.backup_interval_minutes.min(10_080);
    config.backup_retention_count = preferences.backup_retention_count.clamp(1, 365);
    write_config(&app_data, &config)?;
    storage_info(&app)
}

#[tauri::command]
pub fn create_state_backup(
    app: tauri::AppHandle,
    state: Value,
    reason: String,
) -> Result<BackupResult, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let config = read_config(&app_data);
    let directory = backup_directory(&app_data, &config);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let created_at_ms = now_ms()?;
    let file_name = format!("resto-pos-backup-{created_at_ms:013}.json");
    let final_path = directory.join(file_name);
    let temporary_path = directory.join(format!(".resto-pos-backup-{created_at_ms:013}.tmp"));
    let mut payload = match state {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    payload.insert("version".into(), Value::from(5));
    payload.insert("exportedAt".into(), Value::from(created_at_ms.to_string()));
    payload.insert("backupReason".into(), Value::from(reason));
    let serialized =
        serde_json::to_vec_pretty(&Value::Object(payload)).map_err(|error| error.to_string())?;
    fs::write(&temporary_path, serialized).map_err(|error| error.to_string())?;
    fs::rename(&temporary_path, &final_path).map_err(|error| error.to_string())?;
    enforce_retention(&directory, config.backup_retention_count)?;

    Ok(BackupResult {
        path: final_path.to_string_lossy().into_owned(),
        created_at_ms,
    })
}

fn storage_info(app: &tauri::AppHandle) -> Result<StorageInfo, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let config = read_config(&app_data);
    let data_dir = data_directory(&app_data, &config);
    let backup_dir = backup_directory(&app_data, &config);
    let backups = backup_files(&backup_dir)?;
    let last_backup_at_ms = backups.last().and_then(|path| backup_timestamp(path));
    let host_server = super::read_network_config(&app_data).host_server;
    Ok(StorageInfo {
        data_directory: data_dir.to_string_lossy().into_owned(),
        database_path: data_dir.join(DATABASE_FILE).to_string_lossy().into_owned(),
        pending_data_directory: config
            .pending_data_directory
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        backup_directory: backup_dir.to_string_lossy().into_owned(),
        backup_on_startup: config.backup_on_startup,
        backup_on_close: config.backup_on_close,
        backup_interval_minutes: config.backup_interval_minutes,
        backup_retention_count: config.backup_retention_count,
        last_backup_at_ms,
        backup_count: backups.len(),
        requires_restart: config.pending_data_directory.is_some(),
        host_server,
    })
}

fn activate_pending_directory(app_data: &Path, config: &mut StorageConfig) -> Result<(), String> {
    let Some(target_directory) = config.pending_data_directory.clone() else {
        return Ok(());
    };
    fs::create_dir_all(&target_directory).map_err(|error| error.to_string())?;
    let source = database_path(app_data, config);
    let target = target_directory.join(DATABASE_FILE);
    if !target.exists() && source.exists() && source != target {
        let temporary = target_directory.join(format!(".{DATABASE_FILE}.migrating"));
        if temporary.exists() {
            fs::remove_file(&temporary).map_err(|error| error.to_string())?;
        }
        fs::copy(&source, &temporary).map_err(|error| error.to_string())?;
        fs::rename(&temporary, &target).map_err(|error| error.to_string())?;
    }
    config.data_directory = Some(target_directory);
    config.pending_data_directory = None;
    Ok(())
}

fn database_path(app_data: &Path, config: &StorageConfig) -> PathBuf {
    data_directory(app_data, config).join(DATABASE_FILE)
}

fn data_directory(app_data: &Path, config: &StorageConfig) -> PathBuf {
    config
        .data_directory
        .clone()
        .unwrap_or_else(|| app_data.to_path_buf())
}

fn backup_directory(app_data: &Path, config: &StorageConfig) -> PathBuf {
    config
        .backup_directory
        .clone()
        .unwrap_or_else(|| data_directory(app_data, config).join(DEFAULT_BACKUP_FOLDER))
}

fn read_config(app_data: &Path) -> StorageConfig {
    fs::read_to_string(app_data.join(STORAGE_CONFIG_FILE))
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_config(app_data: &Path, config: &StorageConfig) -> Result<(), String> {
    fs::create_dir_all(app_data).map_err(|error| error.to_string())?;
    let serialized = serde_json::to_vec_pretty(config).map_err(|error| error.to_string())?;
    let target = app_data.join(STORAGE_CONFIG_FILE);
    let temporary = app_data.join(format!(".{STORAGE_CONFIG_FILE}.tmp"));
    fs::write(&temporary, serialized).map_err(|error| error.to_string())?;
    if target.exists() {
        fs::remove_file(&target).map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, &target).map_err(|error| error.to_string())
}

fn backup_files(directory: &Path) -> Result<Vec<PathBuf>, String> {
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut files = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with("resto-pos-backup-") && name.ends_with(".json"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    files.sort();
    Ok(files)
}

fn backup_timestamp(path: &Path) -> Option<u128> {
    path.file_stem()?
        .to_str()?
        .strip_prefix("resto-pos-backup-")?
        .parse()
        .ok()
}

fn enforce_retention(directory: &Path, retention_count: usize) -> Result<(), String> {
    let files = backup_files(directory)?;
    let remove_count = files.len().saturating_sub(retention_count.max(1));
    for path in files.into_iter().take(remove_count) {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn now_ms() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|error| error.to_string())
}
