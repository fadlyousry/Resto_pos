import type { AppState } from "../domain/types";
import type { ConnectionStatus, EmbeddedServerInfo } from "../infrastructure/dataClient";

export type StateUpdater = (updater: (current: AppState) => AppState) => void;

export interface NetworkConnection {
  status: ConnectionStatus;
  serverUrl: string;
  embeddedServer: EmbeddedServerInfo | null;
  changeServerUrl: (url: string) => void;
}

export interface ViewProps {
  state: AppState;
  update: StateUpdater;
  notify: (message: string) => void;
  network?: NetworkConnection;
}
