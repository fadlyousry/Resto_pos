import type { AppState } from "../domain/types";

export type StateUpdater = (updater: (current: AppState) => AppState) => void;

export interface ViewProps {
  state: AppState;
  update: StateUpdater;
  notify: (message: string) => void;
}
