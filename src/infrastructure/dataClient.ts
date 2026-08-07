import { invoke } from "@tauri-apps/api/core";
import type { AppState } from "../domain/types";
import { getStateRevision, loadState, saveState } from "./db";
import { publishStateSync, subscribeStateSync } from "./stateSync";
import { normalizeAppState } from "../shared/state";

const SERVER_URL_KEY = "beitna-server-url-v1";
const DEFAULT_SERVER_URL = "http://127.0.0.1:4312";

export interface VersionedState {
  state: AppState;
  revision: string;
}

export interface StateUpdateMessage {
  sourceId: string;
  revision: string;
}

export interface EmbeddedServerInfo {
  port: number;
  localUrl: string;
  networkUrl?: string;
}

interface StoredNetworkConfig {
  hostServer: boolean;
  serverUrl: string;
}

export type ConnectionStatus = "connecting" | "online" | "offline" | "local";

export class StateConflictError extends Error {
  constructor(public readonly current: VersionedState) {
    super("state_revision_conflict");
  }
}

class StateNotInitializedError extends Error {}

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getServerUrl() {
  const configured = localStorage.getItem(SERVER_URL_KEY)
    ?? DEFAULT_SERVER_URL;
  return normalizeServerUrl(configured);
}

export async function setServerUrl(url: string) {
  const normalized = normalizeServerUrl(url);
  localStorage.setItem(SERVER_URL_KEY, normalized);
  if (isTauriRuntime()) {
    await invoke("save_network_config", {
      config: {
        hostServer: isLocalServerUrl(normalized),
        serverUrl: normalized
      } satisfies StoredNetworkConfig
    });
  }
}

export async function getEmbeddedServerInfo(): Promise<EmbeddedServerInfo | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<EmbeddedServerInfo>("get_server_info");
  } catch {
    return null;
  }
}

export async function loadVersionedState(sourceId: string): Promise<VersionedState> {
  if (!isTauriRuntime()) {
    const [state, revision] = await Promise.all([loadState(), getStateRevision()]);
    return { state, revision: revision ?? crypto.randomUUID() };
  }

  await hydrateServerUrl();
  await waitForServer();
  try {
    return await requestServerState();
  } catch (error) {
    if (!(error instanceof StateNotInitializedError)) throw error;
    const legacyState = await loadState();
    return bootstrapServerState(legacyState, sourceId);
  }
}

export async function saveVersionedState(
  state: AppState,
  baseRevision: string,
  sourceId: string
): Promise<string> {
  if (!isTauriRuntime()) {
    const revision = await saveState(state);
    await publishStateSync({ sourceId, revision });
    return revision;
  }

  const response = await fetch(`${getServerUrl()}/api/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, baseRevision, sourceId })
  });
  if (response.status === 409) {
    const conflict = await response.json() as VersionedState & { error: string };
    throw new StateConflictError(normalizeVersionedState(conflict));
  }
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { revision: string };
  return payload.revision;
}

export async function subscribeToStateUpdates(
  sourceId: string,
  onMessage: (message: StateUpdateMessage) => void,
  onStatus: (status: ConnectionStatus) => void
): Promise<() => void> {
  if (!isTauriRuntime()) {
    onStatus("local");
    return subscribeStateSync(sourceId, onMessage);
  }

  let disposed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let reconnectDelay = 500;

  const connect = () => {
    if (disposed) return;
    onStatus("connecting");
    socket = new WebSocket(toWebSocketUrl(getServerUrl()));
    socket.onopen = () => {
      reconnectDelay = 500;
      onStatus("online");
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as StateUpdateMessage & { type?: string };
        const isRemoteUpdate = message.type === "state.updated" && message.sourceId !== sourceId;
        const isReconnectWithNewerState = message.type === "connected" && Boolean(message.revision);
        if (isRemoteUpdate || isReconnectWithNewerState) onMessage(message);
      } catch (error) {
        console.error("Invalid WebSocket message", error);
      }
    };
    socket.onerror = () => onStatus("offline");
    socket.onclose = () => {
      if (disposed) return;
      onStatus("offline");
      reconnectTimer = window.setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
    };
  };

  connect();
  return () => {
    disposed = true;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}

export async function testServerConnection(url = getServerUrl()) {
  const response = await fetch(`${normalizeServerUrl(url)}/api/health`);
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<{ status: string; service: string; revision?: string }>;
}

async function requestServerState(): Promise<VersionedState> {
  const response = await fetch(`${getServerUrl()}/api/state`);
  if (response.status === 404) throw new StateNotInitializedError();
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as VersionedState;
  return normalizeVersionedState(payload);
}

async function bootstrapServerState(state: AppState, sourceId: string): Promise<VersionedState> {
  const response = await fetch(`${getServerUrl()}/api/state/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, baseRevision: null, sourceId })
  });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as VersionedState;
  return normalizeVersionedState(payload);
}

function normalizeVersionedState(payload: VersionedState): VersionedState {
  return { ...payload, state: normalizeAppState(payload.state, payload.state) };
}

async function waitForServer() {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await testServerConnection();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("server_unavailable");
}

function normalizeServerUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_SERVER_URL;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

async function hydrateServerUrl() {
  if (!isTauriRuntime() || localStorage.getItem(SERVER_URL_KEY)) return;
  try {
    const config = await invoke<StoredNetworkConfig>("get_network_config");
    localStorage.setItem(SERVER_URL_KEY, normalizeServerUrl(config.serverUrl));
  } catch (error) {
    console.error("Failed to read network config", error);
  }
}

function isLocalServerUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function toWebSocketUrl(httpUrl: string) {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function responseError(response: Response) {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const payload = await response.json() as { error?: string };
    if (payload.error) detail = payload.error;
  } catch {
    // Keep the HTTP status when the response is not JSON.
  }
  return new Error(detail);
}
