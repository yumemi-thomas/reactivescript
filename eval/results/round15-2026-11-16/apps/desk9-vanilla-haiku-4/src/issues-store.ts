// The issues data shared by the issues page and the tab bar. One store per mounted app.
// Optimistic changes are applied at once and rolled back when the server declines.

import { assign, closeIssue, fetchIssues, renameIssue } from "./api.js";
import type { Issue } from "./api.js";

export type Filter = "open" | "closed";
type Listener = () => void;

export class IssuesStore {
  private rows: Record<Filter, Issue[] | undefined> = { open: undefined, closed: undefined };
  private seq: Record<Filter, number> = { open: 0, closed: 0 };
  private closes = new Map<number, "pending" | "done">();
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  /** The rows of a list; for open issues, without the ones being closed or already closed. */
  rowsOf(f: Filter): Issue[] | undefined {
    const rows = this.rows[f];
    if (f === "closed" || rows === undefined) return rows;
    return rows.filter((r) => !this.closes.has(r.id));
  }

  /** The number of open issues shown, or undefined until they have loaded once. */
  openCount(): number | undefined {
    return this.rowsOf("open")?.length;
  }

  /** Fetches a list. A late answer for a filter that was asked again since is dropped. */
  load(f: Filter): Promise<void> {
    const seq = ++this.seq[f];
    return fetchIssues(f).then((list) => {
      if (seq === this.seq[f]) {
        this.rows[f] = list.map((i) => ({ ...i }));
        this.emit();
      }
    });
  }

  private find(id: number): Issue | undefined {
    for (const f of ["open", "closed"] as const) {
      const hit = (this.rows[f] ?? []).find((i) => i.id === id);
      if (hit) return hit;
    }
    return undefined;
  }

  private each(id: number, fn: (i: Issue) => void): void {
    for (const f of ["open", "closed"] as const) {
      for (const i of this.rows[f] ?? []) if (i.id === id) fn(i);
    }
  }

  assign(id: number, user: string): Promise<void> {
    const prev = this.find(id)?.assignee;
    this.each(id, (i) => {
      i.assignee = user;
    });
    this.emit();
    return assign(id, user).then(
      () => undefined,
      (e: unknown) => {
        if (prev !== undefined) {
          this.each(id, (i) => {
            i.assignee = prev;
          });
        }
        this.emit();
        throw e;
      },
    );
  }

  rename(id: number, title: string): Promise<void> {
    const prev = this.find(id)?.title;
    this.each(id, (i) => {
      i.title = title;
    });
    this.emit();
    return renameIssue(id, title).then(
      () => undefined,
      (e: unknown) => {
        if (prev !== undefined) {
          this.each(id, (i) => {
            i.title = prev;
          });
        }
        this.emit();
        throw e;
      },
    );
  }

  close(id: number): Promise<void> {
    this.closes.set(id, "pending");
    this.emit();
    return closeIssue(id).then(
      () => {
        this.closes.set(id, "done");
        this.emit();
      },
      (e: unknown) => {
        this.closes.delete(id);
        this.emit();
        throw e;
      },
    );
  }
}
