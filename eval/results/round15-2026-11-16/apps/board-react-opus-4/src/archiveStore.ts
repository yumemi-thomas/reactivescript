import * as api from "./api.js";
import type { Archived } from "./api.js";
import { errorMessage } from "./boardStore";

type State = {
  status: "loading" | "error" | "ok";
  error: string;
  items: Archived[];
  restoring: number[];
  restoreError: string | null;
};
export type ArchiveView = State;

export class ArchiveStore {
  private state: State = { status: "loading", error: "", items: [], restoring: [], restoreError: null };
  private view: ArchiveView = this.derive();
  private listeners = new Set<() => void>();
  private started = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getSnapshot = () => this.view;

  private derive(): ArchiveView {
    const s = this.state;
    return { ...s, items: s.items.filter(i => !s.restoring.includes(i.id)) };
  }

  private set(update: (s: State) => State) {
    this.state = update(this.state);
    this.view = this.derive();
    for (const fn of this.listeners) fn();
  }

  start() {
    if (this.started) return;
    this.started = true;
    api.fetchArchived().then(
      items => this.set(s => ({ ...s, status: "ok", error: "", items })),
      (e: unknown) => this.set(s => ({ ...s, status: "error", error: errorMessage(e) })),
    );
  }

  restore(id: number) {
    if (this.state.restoring.includes(id) || !this.view.items.some(i => i.id === id)) return;
    this.set(s => ({ ...s, restoreError: null, restoring: [...s.restoring, id] }));
    api.restoreCard(id).then(
      () => this.set(s => ({ ...s, items: s.items.filter(i => i.id !== id), restoring: s.restoring.filter(r => r !== id) })),
      (e: unknown) => this.set(s => ({ ...s, restoring: s.restoring.filter(r => r !== id), restoreError: errorMessage(e) })),
    );
  }
}
