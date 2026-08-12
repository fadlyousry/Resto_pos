import { invoke } from "@tauri-apps/api/core";
import type { AppState } from "../domain/types";
import { isTauriRuntime } from "./dataClient";

export const BACKUP_SETTINGS_CHANGED_EVENT = "resto-pos-backup-settings-changed";

export interface StorageInfo {
  dataDirectory: string;
  databasePath: string;
  pendingDataDirectory?: string;
  backupDirectory: string;
  backupOnStartup: boolean;
  backupOnClose: boolean;
  backupIntervalMinutes: number;
  backupRetentionCount: number;
  lastBackupAtMs?: number;
  backupCount: number;
  requiresRestart: boolean;
  hostServer: boolean;
}

export interface BackupPreferences {
  backupOnStartup: boolean;
  backupOnClose: boolean;
  backupIntervalMinutes: number;
  backupRetentionCount: number;
}

export interface BackupResult {
  path: string;
  createdAtMs: number;
}

export const canUseDesktopBackups = () => isTauriRuntime();

export async function getStorageInfo() {
  return invoke<StorageInfo>("get_storage_info");
}

export async function selectDataDirectory() {
  return invoke<StorageInfo>("select_data_directory");
}

export async function selectBackupDirectory() {
  return invoke<StorageInfo>("select_backup_directory");
}

export async function saveBackupPreferences(preferences: BackupPreferences) {
  const info = await invoke<StorageInfo>("save_backup_preferences", { preferences });
  window.dispatchEvent(new Event(BACKUP_SETTINGS_CHANGED_EVENT));
  return info;
}

export async function createStateBackup(state: AppState, reason: "manual" | "startup" | "interval" | "close") {
  return invoke<BackupResult>("create_state_backup", { state, reason });
}
