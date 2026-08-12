import { Channel, invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./dataClient";

export interface UpdaterConfiguration {
  currentVersion: string;
  repository?: string;
  configured: boolean;
}

export interface UpdateMetadata {
  currentVersion: string;
  version: string;
  notes?: string;
  publishedAt?: string;
  repository: string;
}

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "unconfigured"
  | "error";

export interface DownloadEvent {
  event: "Started" | "Progress" | "Finished";
  data?: {
    contentLength?: number;
    chunkLength?: number;
    downloaded?: number;
  };
}

export interface AppUpdaterController {
  desktopRuntime: boolean;
  status: UpdaterStatus;
  configuration: UpdaterConfiguration | null;
  update: UpdateMetadata | null;
  progress: number;
  error: string;
  promptVisible: boolean;
  checkNow: (silent?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismissPrompt: () => void;
}

export const updaterAvailable = () => isTauriRuntime();

export async function getUpdaterConfiguration() {
  return invoke<UpdaterConfiguration>("get_updater_configuration");
}

export async function checkForUpdate() {
  return invoke<UpdateMetadata | null>("check_for_update");
}

export async function installPendingUpdate(onProgress: (event: DownloadEvent) => void) {
  const channel = new Channel<DownloadEvent>();
  channel.onmessage = onProgress;
  return invoke<void>("install_pending_update", { onEvent: channel });
}
