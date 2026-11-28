import type { Issue } from "./types";

/** A change to an issue made by this client. */
export type Change =
  | { kind: "assign"; id: number; assignee: string }
  | { kind: "rename"; id: number; title: string }
  | { kind: "close"; id: number };

/** A change sent to the server and not answered yet: shown optimistically. */
export type PendingChange = {
  opId: number;
  change: Change;
  source: "row" | "detail";
  /** the selection it was made for (detail changes report errors only to it) */
  selToken: number;
  /** the issues page it was made on (row changes report errors only to it) */
  pageToken: number;
};

/** A change the server accepted, stamped with when its answer landed. */
export type ConfirmedChange = { change: Change; at: number };

/** The changes to lay over data that was asked for at stamp `at`, oldest first. */
function changesSince(at: number, confirmed: ConfirmedChange[], pending: PendingChange[]): Change[] {
  return [...confirmed.filter((c) => c.at > at).map((c) => c.change), ...pending.map((p) => p.change)];
}

function applyTo(issue: Issue, change: Change): Issue {
  if (change.id !== issue.id) return issue;
  if (change.kind === "assign") return { ...issue, assignee: change.assignee };
  if (change.kind === "rename") return { ...issue, title: change.title };
  return issue;
}

/** The list as the user should see it: the server's answer with this client's changes on top. */
export function viewIssues(
  items: Issue[],
  at: number,
  filter: "open" | "closed",
  confirmed: ConfirmedChange[],
  pending: PendingChange[],
): Issue[] {
  const changes = changesSince(at, confirmed, pending);
  if (changes.length === 0) return items;
  const closed = new Set(changes.filter((c) => c.kind === "close").map((c) => c.id));
  return items
    .filter((issue) => filter !== "open" || !closed.has(issue.id))
    .map((issue) => changes.reduce(applyTo, issue));
}

/** An issue's title as the user should see it. */
export function viewTitle(id: number, title: string, at: number, confirmed: ConfirmedChange[], pending: PendingChange[]): string {
  let result = title;
  for (const c of changesSince(at, confirmed, pending)) {
    if (c.kind === "rename" && c.id === id) result = c.title;
  }
  return result;
}

export type LabelOp = { opId: number; kind: "add" | "remove"; label: string };

/** Labels as the user should see them: the server's last answer with pending changes on top. */
export function viewLabels(labels: string[], ops: LabelOp[]): string[] {
  let result = labels;
  for (const op of ops) {
    if (op.kind === "add") {
      if (!result.includes(op.label)) result = [...result, op.label];
    } else {
      result = result.filter((l) => l !== op.label);
    }
  }
  return result;
}
