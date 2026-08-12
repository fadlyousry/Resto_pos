import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppState } from "../domain/types";
import {
  BACKUP_SETTINGS_CHANGED_EVENT,
  canUseDesktopBackups,
  createStateBackup,
  getStorageInfo
} from "../infrastructure/backup";

export function useAutomaticBackups(state: AppState | null) {
  const stateRef = useRef(state);
  const startupBackupDone = useRef(false);
  const ready = Boolean(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!ready || !canUseDesktopBackups()) return;
    let disposed = false;
    let intervalId: number | null = null;
    let removeCloseListener: (() => void) | undefined;
    let allowingClose = false;
    let closeInProgress = false;

    const wait = (milliseconds: number) => new Promise<void>((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });

    const runBackup = async (reason: "startup" | "interval" | "close") => {
      const current = stateRef.current;
      if (!current) return;
      try {
        await createStateBackup(current, reason);
      } catch (error) {
        console.error(`Automatic ${reason} backup failed`, error);
      }
    };

    const configureSchedule = async () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      try {
        const info = await getStorageInfo();
        if (disposed || !info.hostServer) return;
        if (info.backupOnStartup && !startupBackupDone.current) {
          startupBackupDone.current = true;
          void runBackup("startup");
        }
        if (info.backupIntervalMinutes > 0) {
          intervalId = window.setInterval(
            () => void runBackup("interval"),
            info.backupIntervalMinutes * 60_000
          );
        }
      } catch (error) {
        console.error("Failed to configure automatic backups", error);
      }
    };

    const configureCloseBackup = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        if (appWindow.label !== "main") return;
        removeCloseListener = await appWindow.onCloseRequested((event) => {
          if (allowingClose) return;
          event.preventDefault();
          if (closeInProgress) return;
          closeInProgress = true;
          void (async () => {
            try {
              const info = await Promise.race([
                getStorageInfo().catch(() => null),
                wait(2_000).then(() => null)
              ]);
              if (info?.hostServer && info.backupOnClose) {
                await Promise.race([runBackup("close"), wait(6_000)]);
              }
            } finally {
              allowingClose = true;
              try {
                await invoke("exit_application");
              } catch (error) {
                allowingClose = false;
                closeInProgress = false;
                console.error("Failed to close the application window", error);
              }
            }
          })();
        });
      } catch (error) {
        console.error("Failed to register close backup", error);
      }
    };

    const onSettingsChanged = () => void configureSchedule();
    window.addEventListener(BACKUP_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    void configureSchedule();
    void configureCloseBackup();

    return () => {
      disposed = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      window.removeEventListener(BACKUP_SETTINGS_CHANGED_EVENT, onSettingsChanged);
      removeCloseListener?.();
    };
  }, [ready]);
}
