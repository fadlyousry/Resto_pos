import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "../domain/types";
import { createStateBackup } from "../infrastructure/backup";
import {
  checkForUpdate,
  getUpdaterConfiguration,
  installPendingUpdate,
  updaterAvailable,
  type AppUpdaterController,
  type UpdateMetadata,
  type UpdaterConfiguration,
  type UpdaterStatus
} from "../infrastructure/updater";

export function useAppUpdater(state: AppState | null, notify: (message: string) => void): AppUpdaterController {
  const desktopRuntime = updaterAvailable();
  const stateRef = useRef(state);
  const autoChecked = useRef(false);
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [configuration, setConfiguration] = useState<UpdaterConfiguration | null>(null);
  const [update, setUpdate] = useState<UpdateMetadata | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [promptVisible, setPromptVisible] = useState(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const checkNow = useCallback(async (silent = false) => {
    if (!desktopRuntime) return;
    setStatus("checking");
    setError("");
    try {
      const config = await getUpdaterConfiguration();
      setConfiguration(config);
      if (!config.configured) {
        setStatus("unconfigured");
        if (!silent) notify("سيتم ربط GitHub Releases تلقائيًا عند بناء النسخة من المستودع");
        return;
      }
      const available = await checkForUpdate();
      setUpdate(available);
      if (available) {
        setStatus("available");
        setPromptVisible(true);
        if (!silent) notify(`يتوفر تحديث جديد v${available.version}`);
      } else {
        setStatus("up-to-date");
        if (!silent) notify("أنت تستخدم أحدث إصدار");
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setStatus("error");
      if (!silent) notify("تعذر البحث عن تحديثات؛ تحقق من الإنترنت");
    }
  }, [desktopRuntime, notify]);

  const install = useCallback(async () => {
    if (!update || status === "downloading" || status === "installing") return;
    setError("");
    setProgress(0);
    setStatus("downloading");
    try {
      if (stateRef.current) {
        await createStateBackup(stateRef.current, "manual").catch((reason) => {
          console.error("Pre-update backup failed", reason);
        });
      }
      await installPendingUpdate((event) => {
        if (event.event === "Started") {
          setStatus("downloading");
          setProgress(0);
        } else if (event.event === "Progress") {
          const downloaded = event.data?.downloaded ?? 0;
          const total = event.data?.contentLength ?? 0;
          if (total > 0) setProgress(Math.min(100, Math.round(downloaded / total * 100)));
        } else if (event.event === "Finished") {
          setProgress(100);
          setStatus("installing");
        }
      });
      setStatus("installing");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setStatus("error");
      notify("تعذر تثبيت التحديث");
    }
  }, [notify, status, update]);

  useEffect(() => {
    if (!state || !desktopRuntime || autoChecked.current) return;
    autoChecked.current = true;
    const timer = window.setTimeout(() => void checkNow(true), 2_500);
    return () => window.clearTimeout(timer);
  }, [checkNow, desktopRuntime, state]);

  return {
    desktopRuntime,
    status,
    configuration,
    update,
    progress,
    error,
    promptVisible,
    checkNow,
    install,
    dismissPrompt: () => setPromptVisible(false)
  };
}
