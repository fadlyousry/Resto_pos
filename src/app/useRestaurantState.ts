import { useEffect, useState } from "react";
import type { AppState } from "../domain/types";
import { loadState, saveState } from "../infrastructure/db";
import type { StateUpdater } from "../shared/contracts";

export function useRestaurantState() {
  const [state, setState] = useState<AppState | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadState().then(setState).catch((error) => {
      console.error(error);
      setToast("تعذر فتح قاعدة البيانات");
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const timer = window.setTimeout(() => {
      saveState(state).catch((error) => {
        console.error(error);
        setToast("تعذر حفظ آخر تعديل");
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (state?.settings.restaurantName) {
      document.title = `${state.settings.restaurantName} — إدارة المطعم`;
    }
  }, [state?.settings.restaurantName]);

  const update: StateUpdater = (updater) => {
    setState((current) => current ? updater(current) : current);
  };

  return { state, update, toast, notify: setToast };
}
