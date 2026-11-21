import type { Issue } from "./api.js";

export type Filter = "open" | "closed";

/** An issue change the user made: pending until the server answers, then done (or dropped if declined). */
export type Op = {
  opId: number;
  kind: "assign" | "rename" | "close";
  id: number;
  value: string;
  /** logical time at which the server accepted it; null while pending */
  doneAt: number | null;
};

export type IssuesStore = {
  ops: Op[];
  /** the last open-issues answer the issues page showed, with the time its request started */
  open: { list: Issue[]; startedAt: number } | null;
};

export type IssuesAction =
  | { type: "start"; op: Op }
  | { type: "done"; opId: number; at: number; value?: string }
  | { type: "fail"; opId: number }
  | { type: "openLoaded"; list: Issue[]; startedAt: number };

export const initialIssuesStore: IssuesStore = { ops: [], open: null };

export function issuesReducer(state: IssuesStore, action: IssuesAction): IssuesStore {
  switch (action.type) {
    case "start":
      return { ...state, ops: [...state.ops, action.op] };
    case "done":
      return {
        ...state,
        ops: state.ops.map(op =>
          op.opId === action.opId ? { ...op, doneAt: action.at, value: action.value ?? op.value } : op,
        ),
      };
    case "fail":
      return { ...state, ops: state.ops.filter(op => op.opId !== action.opId) };
    case "openLoaded":
      if (state.open && state.open.startedAt > action.startedAt) return state;
      return { ...state, open: { list: action.list, startedAt: action.startedAt } };
  }
}

/** Does this op still need to be applied on top of an answer whose request started at `startedAt`? */
function applies(op: Op, startedAt: number): boolean {
  return op.doneAt === null || op.doneAt > startedAt;
}

/** The list as it should be shown: the server's answer with the user's pending and newer accepted changes on top. */
export function applyOps(list: Issue[], ops: Op[], filter: Filter, startedAt: number): Issue[] {
  let out = list;
  for (const op of ops) {
    if (!applies(op, startedAt)) continue;
    if (op.kind === "close") {
      if (filter === "open") out = out.filter(i => i.id !== op.id);
    } else if (op.kind === "assign") {
      out = out.map(i => (i.id === op.id ? { ...i, assignee: op.value } : i));
    } else {
      out = out.map(i => (i.id === op.id ? { ...i, title: op.value } : i));
    }
  }
  return out;
}

export function applyTitle(id: number, title: string, ops: Op[], startedAt: number, includePending: boolean): string {
  let out = title;
  for (const op of ops) {
    if (op.kind !== "rename" || op.id !== id) continue;
    if (op.doneAt === null ? includePending : op.doneAt > startedAt) out = op.value;
  }
  return out;
}

export function openCount(store: IssuesStore): number | null {
  if (!store.open) return null;
  return applyOps(store.open.list, store.ops, "open", store.open.startedAt).length;
}
