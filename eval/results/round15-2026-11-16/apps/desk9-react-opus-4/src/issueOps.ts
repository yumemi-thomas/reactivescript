import type { Issue } from "./api";

/** An optimistic change to an issue. `seq` orders changes by when the user asked for them. */
export type IssueOp =
  | { seq: number; id: number; kind: "assign"; user: string }
  | { seq: number; id: number; kind: "rename"; title: string }
  | { seq: number; id: number; kind: "close" };

/** A change the server accepted; `at` is when its answer arrived. */
export type ConfirmedOp = IssueOp & { at: number };

export type RunOp = (op: IssueOp) => Promise<void>;

/**
 * The changes to lay over data fetched at `startedAt`: accepted changes that may have landed after the fetch
 * began, then the ones still in flight, all in the order the user asked for them.
 */
export function overlay(pending: IssueOp[], confirmed: ConfirmedOp[], startedAt: number): IssueOp[] {
  return [...confirmed.filter(o => o.at > startedAt), ...pending].sort((a, b) => a.seq - b.seq);
}

export function applyOps(rows: Issue[], ops: IssueOp[], openList: boolean): Issue[] {
  let out = rows;
  for (const op of ops) {
    switch (op.kind) {
      case "assign":
        out = out.map(r => (r.id === op.id ? { ...r, assignee: op.user } : r));
        break;
      case "rename":
        out = out.map(r => (r.id === op.id ? { ...r, title: op.title } : r));
        break;
      case "close":
        if (openList) out = out.filter(r => r.id !== op.id);
        break;
    }
  }
  return out;
}

export function titleWithOps(id: number, title: string, ops: IssueOp[]): string {
  let out = title;
  for (const op of ops) if (op.kind === "rename" && op.id === id) out = op.title;
  return out;
}
