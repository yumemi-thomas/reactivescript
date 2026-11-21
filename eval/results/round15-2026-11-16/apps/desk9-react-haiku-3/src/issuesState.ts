import type { Issue, IssueDetail } from "./api.js";

export type Filter = "open" | "closed";
/** Where an issue action started: a row of the list, or the detail. */
export type Origin = "row" | "detail";
/** The detail's error slots; each action kind has its own. */
export type Slot = "assign" | "rename" | "close";

export type ListState =
  | { status: "loading" }
  | { status: "ok"; rows: Issue[] }
  | { status: "error"; message: string };

export type DetailState =
  | { status: "loading" }
  | { status: "ok"; issue: IssueDetail }
  | { status: "notFound" }
  | { status: "error"; message: string };

/** An action in flight, recording what it changed so a decline can put it back. */
export type Op =
  | { kind: "assign"; origin: Origin; id: number; hadRow: boolean; prev: string | null }
  | { kind: "rename"; origin: Origin; id: number; prev: string | null }
  | { kind: "close"; origin: Origin; id: number; row: Issue | null; index: number };

export type State = {
  user: string;
  filter: Filter;
  list: ListState;
  /** request id of the list the page is waiting for; older answers are ignored */
  listReq: number;
  selected: number | null;
  detail: DetailState;
  detailReq: number;
  rowError: string | null;
  errors: Record<Slot, string | null>;
  ops: Record<number, Op>;
};

export type Action =
  | { type: "setUser"; user: string }
  | { type: "setFilter"; filter: Filter; req: number }
  | { type: "listLoaded"; req: number; rows: Issue[] }
  | { type: "listFailed"; req: number; message: string }
  | { type: "select"; id: number; req: number }
  | { type: "retryDetail"; req: number }
  | { type: "detailLoaded"; req: number; issue: IssueDetail | null }
  | { type: "detailFailed"; req: number; message: string }
  | { type: "assignStart"; opId: number; origin: Origin; id: number; user: string }
  | { type: "renameStart"; opId: number; origin: Origin; id: number; title: string }
  | { type: "closeStart"; opId: number; origin: Origin; id: number }
  | { type: "opOk"; opId: number; assignee?: string; title?: string }
  | { type: "opFail"; opId: number; message: string };

export function initialState(): State {
  return {
    user: "guest",
    filter: "open",
    list: { status: "loading" },
    listReq: 1,
    selected: null,
    detail: { status: "loading" },
    detailReq: 0,
    rowError: null,
    errors: { assign: null, rename: null, close: null },
    ops: {},
  };
}

/** Issues whose close is still in the air: a reloaded open list leaves them out. */
function closingIds(ops: Record<number, Op>): number[] {
  return Object.values(ops).flatMap((op) => (op.kind === "close" ? [op.id] : []));
}

function mapRows(state: State, fn: (row: Issue) => Issue): State {
  if (state.list.status !== "ok") return state;
  return { ...state, list: { status: "ok", rows: state.list.rows.map(fn) } };
}

/** The detail, when `id` is the selected issue and its detail has loaded. */
function loadedDetail(state: State, id: number): IssueDetail | null {
  return state.selected === id && state.detail.status === "ok" ? state.detail.issue : null;
}

/** Sets an issue's title in the list row and, when it is loaded, in the detail. */
function setTitle(state: State, id: number, title: string): State {
  const next = mapRows(state, (row) => (row.id === id ? { ...row, title } : row));
  const issue = loadedDetail(next, id);
  return issue ? { ...next, detail: { status: "ok", issue: { ...issue, title } } } : next;
}

function withOp(state: State, opId: number, op: Op): State {
  return { ...state, ops: { ...state.ops, [opId]: op } };
}

function withoutOp(state: State, opId: number): State {
  const ops = { ...state.ops };
  delete ops[opId];
  return { ...state, ops };
}

/** A new action clears its own error: a row action clears the row error, a detail action its slot. */
function startErrors(state: State, origin: Origin, slot: Slot): State {
  if (origin === "row") return { ...state, rowError: null };
  return { ...state, errors: { ...state.errors, [slot]: null } };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setUser":
      return { ...state, user: action.user };

    case "setFilter":
      return { ...state, filter: action.filter, list: { status: "loading" }, listReq: action.req };

    case "listLoaded": {
      if (action.req !== state.listReq) return state;
      const skip = state.filter === "open" ? closingIds(state.ops) : [];
      return {
        ...state,
        list: { status: "ok", rows: action.rows.filter((row) => !skip.includes(row.id)) },
      };
    }

    case "listFailed":
      if (action.req !== state.listReq) return state;
      return { ...state, list: { status: "error", message: action.message } };

    case "select":
      return {
        ...state,
        selected: action.id,
        detail: { status: "loading" },
        detailReq: action.req,
        errors: { assign: null, rename: null, close: null },
      };

    case "retryDetail":
      if (state.selected === null) return state;
      return { ...state, detail: { status: "loading" }, detailReq: action.req };

    case "detailLoaded":
      if (action.req !== state.detailReq) return state;
      return {
        ...state,
        detail: action.issue ? { status: "ok", issue: action.issue } : { status: "notFound" },
      };

    case "detailFailed":
      if (action.req !== state.detailReq) return state;
      return { ...state, detail: { status: "error", message: action.message } };

    case "assignStart": {
      const row =
        state.list.status === "ok" ? state.list.rows.find((r) => r.id === action.id) : undefined;
      const op: Op = {
        kind: "assign",
        origin: action.origin,
        id: action.id,
        hadRow: row !== undefined,
        prev: row ? row.assignee : null,
      };
      const cleared = startErrors(state, action.origin, "assign");
      const next = mapRows(cleared, (r) => (r.id === action.id ? { ...r, assignee: action.user } : r));
      return withOp(next, action.opId, op);
    }

    case "renameStart": {
      const issue = loadedDetail(state, action.id);
      const row =
        state.list.status === "ok" ? state.list.rows.find((r) => r.id === action.id) : undefined;
      const prev = issue ? issue.title : row ? row.title : null;
      const cleared = startErrors(state, action.origin, "rename");
      const next = setTitle(cleared, action.id, action.title);
      return withOp(next, action.opId, { kind: "rename", origin: action.origin, id: action.id, prev });
    }

    case "closeStart": {
      const rows = state.list.status === "ok" && state.filter === "open" ? state.list.rows : [];
      const index = rows.findIndex((r) => r.id === action.id);
      const row = index >= 0 ? rows[index] : null;
      let next = startErrors(state, action.origin, "close");
      if (row && next.list.status === "ok") {
        const kept = next.list.rows.filter((r) => r.id !== action.id);
        next = { ...next, list: { status: "ok", rows: kept } };
      }
      return withOp(next, action.opId, {
        kind: "close",
        origin: action.origin,
        id: action.id,
        row,
        index,
      });
    }

    case "opOk": {
      const op = state.ops[action.opId];
      if (!op) return state;
      let next = withoutOp(state, action.opId);
      if (op.kind === "assign" && action.assignee !== undefined) {
        const assignee = action.assignee;
        next = mapRows(next, (r) => (r.id === op.id ? { ...r, assignee } : r));
      }
      if (op.kind === "rename" && action.title !== undefined) {
        next = setTitle(next, op.id, action.title);
      }
      return next;
    }

    case "opFail": {
      const op = state.ops[action.opId];
      if (!op) return state;
      let next = withoutOp(state, action.opId);
      switch (op.kind) {
        case "assign": {
          const prev = op.prev;
          if (op.hadRow) {
            next = mapRows(next, (r) => (r.id === op.id ? { ...r, assignee: prev } : r));
          }
          break;
        }
        case "rename": {
          const prev = op.prev;
          if (prev !== null) next = setTitle(next, op.id, prev);
          break;
        }
        case "close": {
          const row = op.row;
          if (
            row &&
            next.filter === "open" &&
            next.list.status === "ok" &&
            !next.list.rows.some((r) => r.id === row.id)
          ) {
            const rows = [...next.list.rows];
            rows.splice(Math.min(op.index, rows.length), 0, row);
            next = { ...next, list: { status: "ok", rows } };
          }
          break;
        }
      }
      if (op.origin === "row") return { ...next, rowError: `row error: ${action.message}` };
      if (next.selected !== op.id) return next;
      return { ...next, errors: { ...next.errors, [op.kind]: `${op.kind} error: ${action.message}` } };
    }
  }
  return state;
}
