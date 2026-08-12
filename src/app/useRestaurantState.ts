import { useEffect, useRef, useState } from "react";
import type { AppState } from "../domain/types";
import {
  getEmbeddedServerInfo,
  getServerUrl,
  isTauriRuntime,
  loadVersionedState,
  saveVersionedState,
  setServerUrl,
  StateConflictError,
  subscribeToStateUpdates,
  type ConnectionStatus,
  type EmbeddedServerInfo
} from "../infrastructure/dataClient";
import type { StateUpdater } from "../shared/contracts";

type AppStateUpdater = (current: AppState) => AppState;

export function useRestaurantState() {
  const [state, setState] = useState<AppState | null>(null);
  const [toast, setToast] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [connectionError, setConnectionError] = useState("");
  const [embeddedServer, setEmbeddedServer] = useState<EmbeddedServerInfo | null>(null);
  const sourceIdRef = useRef(crypto.randomUUID());
  const stateRef = useRef<AppState | null>(null);
  const syncedStateRef = useRef<AppState | null>(null);
  const revisionRef = useRef("");
  const pendingUpdatersRef = useRef<AppStateUpdater[]>([]);
  const saveInProgressRef = useRef(false);
  const refreshInProgressRef = useRef(false);
  const queuedRemoteRevisionRef = useRef("");
  const flushTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const applyState = (next: AppState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  };

  const scheduleFlush = (delay = 350) => {
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void flushPendingUpdates();
    }, delay);
  };

  const applyLatestServerState = async (expectedRevision?: string) => {
    if (refreshInProgressRef.current) {
      if (expectedRevision) queuedRemoteRevisionRef.current = expectedRevision;
      return;
    }
    if (saveInProgressRef.current) {
      if (expectedRevision) queuedRemoteRevisionRef.current = expectedRevision;
      return;
    }
    if (expectedRevision && expectedRevision === revisionRef.current) return;

    refreshInProgressRef.current = true;
    try {
      const latest = await loadVersionedState(sourceIdRef.current);
      if (!mountedRef.current || latest.revision === revisionRef.current) return;
      syncedStateRef.current = latest.state;
      revisionRef.current = latest.revision;
      const rebased = pendingUpdatersRef.current.reduce(
        (current, updater) => updater(current),
        latest.state
      );
      applyState(rebased);
      if (pendingUpdatersRef.current.length) scheduleFlush();
    } catch (error) {
      console.error(error);
      if (mountedRef.current) setConnectionStatus("offline");
    } finally {
      refreshInProgressRef.current = false;
    }
  };

  const flushPendingUpdates = async () => {
    if (
      saveInProgressRef.current
      || !stateRef.current
      || !syncedStateRef.current
      || !revisionRef.current
      || pendingUpdatersRef.current.length === 0
    ) return;

    saveInProgressRef.current = true;
    const batchLength = pendingUpdatersRef.current.length;
    const candidate = stateRef.current;
    let retryDelay = 100;
    try {
      const revision = await saveVersionedState(
        candidate,
        revisionRef.current,
        sourceIdRef.current
      );
      pendingUpdatersRef.current.splice(0, batchLength);
      syncedStateRef.current = candidate;
      revisionRef.current = revision;
      if (mountedRef.current) {
        setConnectionStatus(isTauriRuntime() ? "online" : "local");
        setConnectionError("");
      }
    } catch (error) {
      if (error instanceof StateConflictError) {
        syncedStateRef.current = error.current.state;
        revisionRef.current = error.current.revision;
        const rebased = pendingUpdatersRef.current.reduce(
          (current, updater) => updater(current),
          error.current.state
        );
        applyState(rebased);
      } else {
        retryDelay = 2_000;
        console.error(error);
        if (mountedRef.current) {
          setConnectionStatus("offline");
          setToast("تعذر الوصول إلى السيرفر؛ سنعيد المحاولة تلقائيًا");
        }
      }
    } finally {
      saveInProgressRef.current = false;
      const remoteRevision = queuedRemoteRevisionRef.current;
      queuedRemoteRevisionRef.current = "";
      if (remoteRevision && pendingUpdatersRef.current.length === 0) {
        void applyLatestServerState(remoteRevision);
      } else if (pendingUpdatersRef.current.length) {
        scheduleFlush(retryDelay);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    let unsubscribe: () => void = () => undefined;

    getEmbeddedServerInfo().then((info) => {
      if (!disposed) setEmbeddedServer(info);
    }).catch(console.error);

    loadVersionedState(sourceIdRef.current)
      .then(async (loaded) => {
        if (disposed) return;
        syncedStateRef.current = loaded.state;
        revisionRef.current = loaded.revision;
        applyState(loaded.state);
        setConnectionError("");
        unsubscribe = await subscribeToStateUpdates(
          sourceIdRef.current,
          (message) => {
            if (message.revision !== revisionRef.current) {
              void applyLatestServerState(message.revision);
            }
          },
          (status) => {
            if (!disposed) setConnectionStatus(status);
          }
        );
        if (disposed) unsubscribe();
      })
      .catch((error) => {
        console.error(error);
        if (!disposed) {
          setConnectionStatus("offline");
          setConnectionError("تعذر الاتصال بالسيرفر الرئيسي لـ Resto POS. تأكد أن عنوان السيرفر صحيح وأن الجهاز متصل بالشبكة.");
        }
      });

    return () => {
      disposed = true;
      mountedRef.current = false;
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
      unsubscribe();
    };
  }, []);

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
    const current = stateRef.current;
    if (!current) return;
    pendingUpdatersRef.current.push(updater);
    applyState(updater(current));
    scheduleFlush();
  };

  const changeServerUrl = (url: string) => {
    setServerUrl(url)
      .then(() => window.location.reload())
      .catch((error) => {
        console.error(error);
        setToast("تعذر حفظ إعداد السيرفر");
      });
  };

  const retryConnection = () => window.location.reload();

  return {
    state,
    update,
    toast,
    notify: setToast,
    connectionStatus,
    connectionError,
    serverUrl: getServerUrl(),
    embeddedServer,
    changeServerUrl,
    retryConnection
  };
}
