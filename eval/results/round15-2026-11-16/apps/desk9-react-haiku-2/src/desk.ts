import { QueryClient } from "@tanstack/react-query";
import {
  addComment,
  addLabel,
  assign,
  closeIssue,
  removeLabel,
  renameIssue,
} from "./api";
import type { Comment, Issue, IssueDetail } from "./api";

export type Filter = "open" | "closed";

/** Shared per app instance: the query cache and the open-issue count. */
export type Desk = { qc: QueryClient; open: OpenIssues };

export function createDesk(): Desk {
  return {
    qc: new QueryClient({
      defaultOptions: {
        queries: {
          // Leaving a page discards its data: nothing is kept once unobserved.
          gcTime: 0,
          retry: false,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
      },
    }),
    open: new OpenIssues(),
  };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * The ids of the open issues as the issues page last showed them. Kept outside
 * the query cache so the tab count survives the issues page being left.
 */
export class OpenIssues {
  private ids: ReadonlySet<number> | null = null;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly count = (): number | null => (this.ids === null ? null : this.ids.size);

  set(ids: number[]): void {
    this.ids = new Set(ids);
    this.emit();
  }

  /** Returns whether the issue was counted (and so is now removed). */
  remove(id: number): boolean {
    if (!this.ids?.has(id)) return false;
    const next = new Set(this.ids);
    next.delete(id);
    this.ids = next;
    this.emit();
    return true;
  }

  restore(id: number): void {
    if (this.ids && !this.ids.has(id)) {
      this.ids = new Set([...this.ids, id]);
      this.emit();
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function insertAt<T>(list: T[], index: number, item: T): T[] {
  const copy = [...list];
  copy.splice(Math.min(index, copy.length), 0, item);
  return copy;
}

function mapIssue(qc: QueryClient, id: number, change: (i: Issue) => Issue): void {
  qc.setQueriesData<Issue[]>({ queryKey: ["issues"] }, (list) =>
    list?.map((i) => (i.id === id ? change(i) : i)),
  );
}

function currentAssignee(qc: QueryClient, id: number): string | null | undefined {
  for (const [, list] of qc.getQueriesData<Issue[]>({ queryKey: ["issues"] })) {
    const found = list?.find((i) => i.id === id);
    if (found) return found.assignee;
  }
  return undefined;
}

/** Shows the assignee at once; on refusal puts the previous one back and rethrows. */
export async function assignIssue(qc: QueryClient, id: number, user: string): Promise<void> {
  const before = currentAssignee(qc, id);
  mapIssue(qc, id, (i) => ({ ...i, assignee: user }));
  try {
    const saved = await assign(id, user);
    mapIssue(qc, id, (i) => ({ ...i, assignee: saved.assignee }));
  } catch (e) {
    if (before !== undefined) mapIssue(qc, id, (i) => ({ ...i, assignee: before }));
    throw e;
  }
}

function currentTitle(qc: QueryClient, id: number): string | undefined {
  const detail = qc.getQueryData<IssueDetail | null>(["issue", id]);
  if (detail) return detail.title;
  for (const [, list] of qc.getQueriesData<Issue[]>({ queryKey: ["issues"] })) {
    const found = list?.find((i) => i.id === id);
    if (found) return found.title;
  }
  return undefined;
}

function setTitle(qc: QueryClient, id: number, title: string): void {
  mapIssue(qc, id, (i) => ({ ...i, title }));
  qc.setQueryData<IssueDetail | null>(["issue", id], (d) => (d ? { ...d, title } : undefined));
}

/** Shows the new title at once in the row and the heading; on refusal restores the old one and rethrows. */
export async function renameTo(qc: QueryClient, id: number, title: string): Promise<void> {
  const before = currentTitle(qc, id);
  setTitle(qc, id, title);
  try {
    const saved = await renameIssue(id, title);
    setTitle(qc, id, saved.title);
  } catch (e) {
    if (before !== undefined) setTitle(qc, id, before);
    throw e;
  }
}

/** Takes the issue off the open list at once; on refusal puts it back where it was and rethrows. */
export async function closeWith(qc: QueryClient, open: OpenIssues, id: number): Promise<void> {
  const list = qc.getQueryData<Issue[]>(["issues", "open"]);
  const index = list ? list.findIndex((i) => i.id === id) : -1;
  const row = index >= 0 && list ? list[index] : undefined;
  qc.setQueryData<Issue[]>(["issues", "open"], (l) => l?.filter((i) => i.id !== id));
  const wasCounted = open.remove(id);
  try {
    await closeIssue(id);
  } catch (e) {
    if (row) {
      qc.setQueryData<Issue[]>(["issues", "open"], (l) =>
        l && !l.some((i) => i.id === id) ? insertAt(l, index, row) : l,
      );
    }
    if (wasCounted) open.restore(id);
    throw e;
  }
}

export type CommentRow = Comment & { sending?: number };
let nextSendKey = 0;

/** Adds the comment as the last row at once, marked as sending; the marker goes when accepted, the row goes when refused. */
export async function postComment(qc: QueryClient, id: number, author: string, text: string): Promise<void> {
  const key = ++nextSendKey;
  qc.setQueryData<CommentRow[]>(["comments", id], (l) => l && [...l, { author, text, sending: key }]);
  try {
    const saved = await addComment(id, author, text);
    qc.setQueryData<CommentRow[]>(["comments", id], (l) =>
      l?.map((c) => (c.sending === key ? { author: saved.author, text: saved.text } : c)),
    );
  } catch (e) {
    qc.setQueryData<CommentRow[]>(["comments", id], (l) => l?.filter((c) => c.sending !== key));
    throw e;
  }
}

/** Adds the label at once; on refusal removes it and rethrows. */
export async function addLabelTo(qc: QueryClient, id: number, label: string): Promise<void> {
  qc.setQueryData<string[]>(["labels", id], (l) => l && [...l, label]);
  try {
    const labels = await addLabel(id, label);
    qc.setQueryData<string[]>(["labels", id], labels);
  } catch (e) {
    qc.setQueryData<string[]>(["labels", id], (l) => l?.filter((x) => x !== label));
    throw e;
  }
}

/** Removes the label at once; on refusal puts it back where it was and rethrows. */
export async function removeLabelFrom(qc: QueryClient, id: number, label: string): Promise<void> {
  const before = qc.getQueryData<string[]>(["labels", id]);
  const index = before ? before.indexOf(label) : -1;
  qc.setQueryData<string[]>(["labels", id], (l) => l?.filter((x) => x !== label));
  try {
    const labels = await removeLabel(id, label);
    qc.setQueryData<string[]>(["labels", id], labels);
  } catch (e) {
    if (index >= 0) {
      qc.setQueryData<string[]>(["labels", id], (l) =>
        l && !l.includes(label) ? insertAt(l, index, label) : l,
      );
    }
    throw e;
  }
}
