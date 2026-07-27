import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

const STATE_SYNC_EVENT = "beitna://state-updated";
const STATE_SYNC_CHANNEL = "beitna-state-sync-v1";

export interface StateSyncMessage {
  sourceId: string;
  revision: string;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function publishStateSync(message: StateSyncMessage) {
  if (isTauriRuntime()) {
    await emit(STATE_SYNC_EVENT, message);
    return;
  }
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(STATE_SYNC_CHANNEL);
    channel.postMessage(message);
    channel.close();
  }
}

export async function subscribeStateSync(
  sourceId: string,
  onMessage: (message: StateSyncMessage) => void
): Promise<() => void> {
  if (isTauriRuntime()) {
    const unlisten: UnlistenFn = await listen<StateSyncMessage>(STATE_SYNC_EVENT, (event) => {
      if (event.payload.sourceId !== sourceId) onMessage(event.payload);
    });
    return unlisten;
  }
  if (!("BroadcastChannel" in window)) return () => undefined;
  const channel = new BroadcastChannel(STATE_SYNC_CHANNEL);
  channel.onmessage = (event: MessageEvent<StateSyncMessage>) => {
    if (event.data.sourceId !== sourceId) onMessage(event.data);
  };
  return () => channel.close();
}
