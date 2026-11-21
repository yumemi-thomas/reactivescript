import type { Issue } from "./api";

/** The issue fields that the app changes optimistically. */
export type Field = "assignee" | "title" | "closed";
export type FieldValue = string | boolean | null;

/** A change the app has asked the server for and is still waiting on. */
export type Op = { seq: number; id: number; field: Field; value: FieldValue };

/** A change the server accepted: `opSeq` orders changes, `atSeq` says when the answer came. */
type Confirmed = { value: FieldValue; opSeq: number; atSeq: number };

export type IssuesState = {
  pending: Op[];
  confirmed: Record<string, Confirmed>;
  /** The last answer of `fetchIssues("open")` and the seq at which it was asked. */
  openSnapshot: { issues: Issue[]; seq: number } | null;
};

export type IssuesAction =
  | { type: "start"; op: Op }
  | { type: "accept"; op: Op; value: FieldValue; atSeq: number }
  | { type: "decline"; op: Op }
  | { type: "openLoaded"; issues: Issue[]; seq: number };

export const initialIssuesState: IssuesState = { pending: [], confirmed: {}, openSnapshot: null };

const keyOf = (id: number, field: Field) => `${id}:${field}`;

export function issuesReducer(state: IssuesState, action: IssuesAction): IssuesState {
  switch (action.type) {
    case "start":
      return { ...state, pending: [...state.pending, action.op] };
    case "decline":
      return { ...state, pending: state.pending.filter(op => op.seq !== action.op.seq) };
    case "accept": {
      const pending = state.pending.filter(op => op.seq !== action.op.seq);
      const key = keyOf(action.op.id, action.op.field);
      const existing = state.confirmed[key];
      if (existing && existing.opSeq > action.op.seq) return { ...state, pending };
      return {
        ...state,
        pending,
        confirmed: { ...state.confirmed, [key]: { value: action.value, opSeq: action.op.seq, atSeq: action.atSeq } },
      };
    }
    case "openLoaded":
      if (state.openSnapshot && state.openSnapshot.seq > action.seq) return state;
      return { ...state, openSnapshot: { issues: action.issues, seq: action.seq } };
  }
}

/**
 * The value to show for an issue's field: the latest change still in flight, else a change the server accepted after
 * `base` was asked for, else `base`.
 */
export function resolveField<V extends FieldValue>(
  state: IssuesState,
  id: number,
  field: Field,
  base: V,
  baseSeq: number,
  includePending = true,
): V {
  if (includePending) {
    let latest: Op | undefined;
    for (const op of state.pending) {
      if (op.id === id && op.field === field && (!latest || op.seq > latest.seq)) latest = op;
    }
    if (latest) return latest.value as V;
  }
  const c = state.confirmed[keyOf(id, field)];
  if (c && c.atSeq > baseSeq) return c.value as V;
  return base;
}

/** The rows of a loaded list as they should be shown, with the changes in flight and accepted applied. */
export function shownIssues(state: IssuesState, issues: Issue[], seq: number, filter: "open" | "closed"): Issue[] {
  const out: Issue[] = [];
  for (const issue of issues) {
    if (filter === "open" && resolveField(state, issue.id, "closed", false, seq)) continue;
    out.push({
      id: issue.id,
      title: resolveField(state, issue.id, "title", issue.title, seq),
      assignee: resolveField(state, issue.id, "assignee", issue.assignee, seq),
    });
  }
  return out;
}

export function openCount(state: IssuesState): number | null {
  const snap = state.openSnapshot;
  if (!snap) return null;
  return shownIssues(state, snap.issues, snap.seq, "open").length;
}

/** Resolves to `null` when the server accepted the change, or to the server's message when it declined. */
export type IssueActions = {
  assign: (id: number, user: string) => Promise<string | null>;
  rename: (id: number, title: string) => Promise<string | null>;
  close: (id: number) => Promise<string | null>;
};
