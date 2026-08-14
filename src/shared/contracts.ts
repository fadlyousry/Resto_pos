import type { AppState } from "../domain/types";
import type { ConnectedDevice, ConnectionStatus, EmbeddedServerInfo } from "../infrastructure/dataClient";
import type { AppUpdaterController } from "../infrastructure/updater";

export type StateUpdater = (updater: (current: AppState) => AppState) => void;

export interface NetworkConnection {
  status: ConnectionStatus;
  serverUrl: string;
  embeddedServer: EmbeddedServerInfo | null;
  connectedDevices: ConnectedDevice[];
  changeServerUrl: (url: string) => void;
}

export interface ViewProps {
  state: AppState;
  update: StateUpdater;
  notify: (message: string) => void;
  network?: NetworkConnection;
  updater?: AppUpdaterController;
}
