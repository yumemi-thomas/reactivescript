import type { Issue } from "./api.js";

export type Listing = "open" | "closed";
type Listener = () => void;
type Patch = Partial<Pick<Issue, "title" | "assignee">>;

/**
 * The issues the app knows about, kept across page visits: the last answer for each list, and the
 * open issues whose close is in the air. The open count is derived from these, so the tab label,
 * the open list and the row closes all read one place.
 */
export class IssueStore {
  private open: Issue[] | null = null;
  private closed: Issue[] | null = null;
  private closing = new Set<number>();
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  listOf(filter: Listing): Issue[] | null {
    return filter === "open" ? this.open : this.closed;
  }

  /** The open issues as the page shows them: the last answer without the closes in the air. */
  visibleOpen(): Issue[] | null {
    return this.open === null ? null : this.open.filter((i) => !this.closing.has(i.id));
  }

  /** The open count, or null until the open issues have loaded once. */
  openCount(): number | null {
    const visible = this.visibleOpen();
    return visible === null ? null : visible.length;
  }

  setList(filter: Listing, items: Issue[]): void {
    if (filter === "open") this.open = items;
    else this.closed = items;
    this.emit();
  }

  /** The assignee the issue has now, or undefined when the store does not hold it. */
  assigneeOf(id: number): string | null | undefined {
    return this.find(id)?.assignee;
  }

  titleOf(id: number): string | undefined {
    return this.find(id)?.title;
  }

  patch(id: number, change: Patch): void {
    const apply = (list: Issue[] | null): Issue[] | null =>
      list === null ? null : list.map((i) => (i.id === id ? { ...i, ...change } : i));
    this.open = apply(this.open);
    this.closed = apply(this.closed);
    this.emit();
  }

  isClosing(id: number): boolean {
    return this.closing.has(id);
  }

  beginClose(id: number): void {
    this.closing.add(id);
    this.emit();
  }

  /** An accepted close keeps the issue out of the open list; a declined one puts it back. */
  endClose(id: number, accepted: boolean): void {
    this.closing.delete(id);
    if (accepted && this.open !== null) this.open = this.open.filter((i) => i.id !== id);
    this.emit();
  }

  private find(id: number): Issue | undefined {
    return this.open?.find((i) => i.id === id) ?? this.closed?.find((i) => i.id === id);
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
