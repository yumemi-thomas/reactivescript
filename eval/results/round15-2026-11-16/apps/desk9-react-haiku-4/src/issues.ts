import type { Dispatch } from "react";
import {
  addComment as apiAddComment,
  addLabel as apiAddLabel,
  assign as apiAssign,
  closeIssue as apiClose,
  fetchComments,
  fetchIssue,
  fetchIssues,
  fetchLabels,
  removeLabel as apiRemoveLabel,
  renameIssue as apiRename,
  search,
  type Comment,
  type Hit,
  type Issue,
  type IssueDetail,
} from "./api.js";
import { errorMessage, nextToken } from "./util";

export type Filter = "open" | "closed";
/** Where a row or detail action was started. */
export type Origin = "detail" | "row";
export type ErrorKey = "assign" | "rename" | "close" | "post" | "label";

/**
 * An action on an issue that the server has not answered yet. The list shows
 * it at once; a declined one is dropped, which puts the row back as it was.
 */
export type Op =
  | { key: number; kind: "assign"; id: number; user: string; from: Origin; selToken: number }
  | { key: number; kind: "rename"; id: number; title: string; from: Origin; selToken: number }
  | { key: number; kind: "close"; id: number; from: Origin; selToken: number };

export type LabelOp = { key: number; kind: "add" | "remove"; label: string };
export type Entry = { key: string; author: string; text: string; pending: boolean };
export type Errors = Record<ErrorKey, string | null>;

export type ListState = {
  token: number;
  status: "idle" | "loading" | "ok" | "error";
  /** true once the list has answered at least once; the count waits for it */
  loaded: boolean;
  items: Issue[];
  error: string | null;
};

export type DetailState = {
  token: number;
  status: "loading" | "ok" | "notfound" | "error";
  issue: IssueDetail | null;
  error: string | null;
};

export type CommentsState = {
  token: number;
  status: "loading" | "ok" | "error";
  entries: Entry[];
  error: string | null;
};

export type LabelsState = {
  token: number;
  status: "loading" | "ok" | "error";
  base: string[];
  ops: LabelOp[];
  error: string | null;
};

export type RelatedState = {
  token: number;
  query: string;
  status: "loading" | "ok" | "error";
  hits: Hit[];
  error: string | null;
};

export type Page = {
  user: string;
  filter: Filter;
  selectedId: number | null;
  /** changes on every selection; detail errors only show for the selection they belong to */
  selToken: number;
  detail: DetailState | null;
  titleInput: string;
  commentInput: string;
  labelInput: string;
  errors: Errors;
  rowError: string | null;
  comments: CommentsState | null;
  labels: LabelsState | null;
  related: RelatedState | null;
};

export type IssuesState = {
  lists: { open: ListState; closed: ListState };
  ops: Op[];
  page: Page;
};

export type IssuesAction =
  | { type: "listStart"; filter: Filter; token: number }
  | { type: "listOk"; filter: Filter; token: number; items: Issue[] }
  | { type: "listErr"; filter: Filter; token: number; error: string }
  | { type: "setFilter"; filter: Filter }
  | { type: "resetPage" }
  | { type: "setUser"; user: string }
  | { type: "setTitleInput"; value: string }
  | { type: "setCommentInput"; value: string }
  | { type: "setLabelInput"; value: string }
  | { type: "select"; id: number; selToken: number; detailToken: number; commentsToken: number; labelsToken: number }
  | { type: "retryDetail"; token: number }
  | { type: "detailOk"; token: number; issue: IssueDetail | null }
  | { type: "detailErr"; token: number; error: string }
  | { type: "commentsOk"; token: number; comments: Comment[] }
  | { type: "commentsErr"; token: number; error: string }
  | { type: "labelsOk"; token: number; labels: string[] }
  | { type: "labelsErr"; token: number; error: string }
  | { type: "relatedStart"; token: number; detailToken: number; query: string }
  | { type: "relatedOk"; token: number; hits: Hit[] }
  | { type: "relatedErr"; token: number; error: string }
  | { type: "opStart"; op: Op }
  | { type: "opDone"; key: number; value: string }
  | { type: "opFail"; key: number; error: string }
  | { type: "postStart"; key: number; author: string; text: string }
  | { type: "postDone"; key: number; comment: Comment }
  | { type: "postFail"; key: number; error: string }
  | { type: "labelOpStart"; op: LabelOp }
  | { type: "labelOpDone"; key: number; labels: string[] }
  | { type: "labelOpFail"; key: number; error: string };

const NO_ERRORS: Errors = { assign: null, rename: null, close: null, post: null, label: null };

function freshPage(): Page {
  return {
    user: "guest",
    filter: "open",
    selectedId: null,
    selToken: 0,
    detail: null,
    titleInput: "",
    commentInput: "",
    labelInput: "",
    errors: NO_ERRORS,
    rowError: null,
    comments: null,
    labels: null,
    related: null,
  };
}

// The open list is loaded once at start-up with token 0, so this initial state is the request in the air.
export const INITIAL_ISSUES: IssuesState = {
  lists: {
    open: { token: 0, status: "loading", loaded: false, items: [], error: null },
    closed: { token: 0, status: "idle", loaded: false, items: [], error: null },
  },
  ops: [],
  page: freshPage(),
};

function withPage(state: IssuesState, patch: Partial<Page>): IssuesState {
  return { ...state, page: { ...state.page, ...patch } };
}

function withList(state: IssuesState, filter: Filter, list: ListState): IssuesState {
  return {
    ...state,
    lists: filter === "open" ? { open: list, closed: state.lists.closed } : { open: state.lists.open, closed: list },
  };
}

function mapItems(state: IssuesState, fn: (items: Issue[]) => Issue[]): IssuesState {
  return {
    ...state,
    lists: {
      open: { ...state.lists.open, items: fn(state.lists.open.items) },
      closed: { ...state.lists.closed, items: fn(state.lists.closed.items) },
    },
  };
}

function withError(errors: Errors, key: ErrorKey, message: string | null): Errors {
  return { ...errors, [key]: message };
}

export function issuesReducer(state: IssuesState, action: IssuesAction): IssuesState {
  switch (action.type) {
    case "listStart": {
      const list = state.lists[action.filter];
      return withList(state, action.filter, { ...list, token: action.token, status: "loading", error: null });
    }
    case "listOk": {
      const list = state.lists[action.filter];
      if (list.token !== action.token) return state;
      return withList(state, action.filter, { ...list, status: "ok", loaded: true, items: action.items, error: null });
    }
    case "listErr": {
      const list = state.lists[action.filter];
      if (list.token !== action.token) return state;
      return withList(state, action.filter, { ...list, status: "error", error: action.error });
    }
    case "setFilter":
      return withPage(state, { filter: action.filter });
    case "resetPage":
      return { ...state, page: freshPage() };
    case "setUser":
      return withPage(state, { user: action.user });
    case "setTitleInput":
      return withPage(state, { titleInput: action.value });
    case "setCommentInput":
      return withPage(state, { commentInput: action.value });
    case "setLabelInput":
      return withPage(state, { labelInput: action.value });
    case "select":
      return withPage(state, {
        selectedId: action.id,
        selToken: action.selToken,
        detail: { token: action.detailToken, status: "loading", issue: null, error: null },
        titleInput: "",
        commentInput: "",
        labelInput: "",
        errors: NO_ERRORS,
        comments: { token: action.commentsToken, status: "loading", entries: [], error: null },
        labels: { token: action.labelsToken, status: "loading", base: [], ops: [], error: null },
        related: null,
      });
    case "retryDetail":
      return withPage(state, {
        detail: { token: action.token, status: "loading", issue: null, error: null },
        related: null,
      });
    case "detailOk": {
      if (state.page.detail?.token !== action.token) return state;
      return withPage(state, {
        detail: { token: action.token, status: action.issue ? "ok" : "notfound", issue: action.issue, error: null },
      });
    }
    case "detailErr": {
      if (state.page.detail?.token !== action.token) return state;
      return withPage(state, {
        detail: { token: action.token, status: "error", issue: null, error: action.error },
      });
    }
    case "commentsOk": {
      const comments = state.page.comments;
      if (!comments || comments.token !== action.token) return state;
      const served: Entry[] = action.comments.map((c, i) => ({
        key: `served-${i}`,
        author: c.author,
        text: c.text,
        pending: false,
      }));
      // A post that was asked while the list loaded may be missing from the answer; keep it unless the answer has it.
      const posted = comments.entries.filter(
        (e) => e.key.startsWith("post-") && !served.some((s) => s.author === e.author && s.text === e.text),
      );
      return withPage(state, {
        comments: { token: comments.token, status: "ok", entries: [...served, ...posted], error: null },
      });
    }
    case "commentsErr": {
      const comments = state.page.comments;
      if (!comments || comments.token !== action.token) return state;
      return withPage(state, { comments: { ...comments, status: "error", error: action.error } });
    }
    case "labelsOk": {
      const labels = state.page.labels;
      // an answer to a change already applied is newer than this list, which may predate it
      if (!labels || labels.token !== action.token || labels.status === "ok") return state;
      return withPage(state, { labels: { ...labels, status: "ok", base: action.labels, error: null } });
    }
    case "labelsErr": {
      const labels = state.page.labels;
      if (!labels || labels.token !== action.token || labels.status === "ok") return state;
      return withPage(state, { labels: { ...labels, status: "error", error: action.error } });
    }
    case "relatedStart": {
      const detail = state.page.detail;
      if (!detail || detail.token !== action.detailToken || detail.status !== "ok") return state;
      return withPage(state, {
        related: { token: action.token, query: action.query, status: "loading", hits: [], error: null },
      });
    }
    case "relatedOk": {
      const related = state.page.related;
      if (!related || related.token !== action.token) return state;
      return withPage(state, { related: { ...related, status: "ok", hits: action.hits, error: null } });
    }
    case "relatedErr": {
      const related = state.page.related;
      if (!related || related.token !== action.token) return state;
      return withPage(state, { related: { ...related, status: "error", hits: [], error: action.error } });
    }
    case "opStart": {
      const op = action.op;
      const patch: Partial<Page> =
        op.from === "row" ? { rowError: null } : { errors: withError(state.page.errors, op.kind, null) };
      return { ...withPage(state, patch), ops: [...state.ops, op] };
    }
    case "opDone": {
      const op = state.ops.find((o) => o.key === action.key);
      if (!op) return state;
      const next: IssuesState = { ...state, ops: state.ops.filter((o) => o.key !== action.key) };
      if (op.kind === "assign") {
        return mapItems(next, (items) => items.map((i) => (i.id === op.id ? { ...i, assignee: action.value } : i)));
      }
      if (op.kind === "rename") {
        const renamed = mapItems(next, (items) =>
          items.map((i) => (i.id === op.id ? { ...i, title: action.value } : i)),
        );
        const detail = renamed.page.detail;
        if (!detail?.issue || detail.issue.id !== op.id) return renamed;
        return withPage(renamed, { detail: { ...detail, issue: { ...detail.issue, title: action.value } } });
      }
      const open = next.lists.open;
      return withList(next, "open", { ...open, items: open.items.filter((i) => i.id !== op.id) });
    }
    case "opFail": {
      const op = state.ops.find((o) => o.key === action.key);
      if (!op) return state;
      const next: IssuesState = { ...state, ops: state.ops.filter((o) => o.key !== action.key) };
      if (op.from === "row") return withPage(next, { rowError: `row error: ${action.error}` });
      if (op.selToken !== next.page.selToken) return next;
      return withPage(next, {
        errors: withError(next.page.errors, op.kind, `${op.kind} error: ${action.error}`),
      });
    }
    case "postStart": {
      const comments = state.page.comments;
      const entry: Entry = { key: `post-${action.key}`, author: action.author, text: action.text, pending: true };
      return withPage(state, {
        comments: comments && { ...comments, entries: [...comments.entries, entry] },
        commentInput: "",
        errors: withError(state.page.errors, "post", null),
      });
    }
    case "postDone": {
      const comments = state.page.comments;
      const key = `post-${action.key}`;
      if (!comments || !comments.entries.some((e) => e.key === key)) return state;
      const entries = comments.entries.map((e) =>
        e.key === key ? { ...e, author: action.comment.author, text: action.comment.text, pending: false } : e,
      );
      return withPage(state, { comments: { ...comments, entries } });
    }
    case "postFail": {
      const comments = state.page.comments;
      const key = `post-${action.key}`;
      if (!comments || !comments.entries.some((e) => e.key === key)) return state;
      return withPage(state, {
        comments: { ...comments, entries: comments.entries.filter((e) => e.key !== key) },
        errors: withError(state.page.errors, "post", `post error: ${action.error}`),
      });
    }
    case "labelOpStart": {
      const labels = state.page.labels;
      if (!labels) return state;
      return withPage(state, {
        labels: { ...labels, ops: [...labels.ops, action.op] },
        errors: withError(state.page.errors, "label", null),
        labelInput: action.op.kind === "add" ? "" : state.page.labelInput,
      });
    }
    case "labelOpDone": {
      const labels = state.page.labels;
      if (!labels || !labels.ops.some((o) => o.key === action.key)) return state;
      return withPage(state, {
        labels: {
          ...labels,
          ops: labels.ops.filter((o) => o.key !== action.key),
          base: action.labels,
          status: "ok",
          error: null,
        },
      });
    }
    case "labelOpFail": {
      const labels = state.page.labels;
      if (!labels || !labels.ops.some((o) => o.key === action.key)) return state;
      return withPage(state, {
        labels: { ...labels, ops: labels.ops.filter((o) => o.key !== action.key) },
        errors: withError(state.page.errors, "label", `label error: ${action.error}`),
      });
    }
    default:
      return state;
  }
}

/** The rows the list shows: the answered rows with the pending actions applied. */
export function visibleRows(state: IssuesState, filter: Filter): Issue[] {
  let rows = state.lists[filter].items;
  for (const op of state.ops) {
    if (op.kind === "assign") {
      rows = rows.map((r) => (r.id === op.id ? { ...r, assignee: op.user } : r));
    } else if (op.kind === "rename") {
      rows = rows.map((r) => (r.id === op.id ? { ...r, title: op.title } : r));
    } else if (filter === "open") {
      rows = rows.filter((r) => r.id !== op.id);
    }
  }
  return rows;
}

/** The tab's count: null until the open issues have loaded once, then the open rows as shown. */
export function openCount(state: IssuesState): number | null {
  return state.lists.open.loaded ? visibleRows(state, "open").length : null;
}

export function displayTitle(state: IssuesState, id: number, title: string): string {
  let shown = title;
  for (const op of state.ops) {
    if (op.kind === "rename" && op.id === id) shown = op.title;
  }
  return shown;
}

export function labelsShown(labels: LabelsState): string[] {
  let shown = labels.base;
  for (const op of labels.ops) {
    if (op.kind === "add") {
      shown = shown.includes(op.label) ? shown : [...shown, op.label];
    } else {
      shown = shown.filter((l) => l !== op.label);
    }
  }
  return shown;
}

// ---- requests -------------------------------------------------------------

type Send = Dispatch<IssuesAction>;

// The issue currently selected; a detail answer for any other selection does not start a related search.
let liveDetailToken = 0;

export function loadListWith(d: Send, filter: Filter, token: number): void {
  fetchIssues(filter).then(
    (items) => d({ type: "listOk", filter, token, items }),
    (e: unknown) => d({ type: "listErr", filter, token, error: errorMessage(e) }),
  );
}

export function loadList(d: Send, filter: Filter): void {
  const token = nextToken();
  d({ type: "listStart", filter, token });
  loadListWith(d, filter, token);
}

function loadDetail(d: Send, id: number, token: number): void {
  fetchIssue(id).then(
    (issue) => {
      d({ type: "detailOk", token, issue });
      if (issue && token === liveDetailToken) loadRelated(d, token, issue.title);
    },
    (e: unknown) => d({ type: "detailErr", token, error: errorMessage(e) }),
  );
}

function loadRelated(d: Send, detailToken: number, query: string): void {
  const token = nextToken();
  d({ type: "relatedStart", token, detailToken, query });
  search(query).then(
    (hits) => d({ type: "relatedOk", token, hits }),
    (e: unknown) => d({ type: "relatedErr", token, error: errorMessage(e) }),
  );
}

export function selectIssue(d: Send, id: number): void {
  const selToken = nextToken();
  const detailToken = nextToken();
  const commentsToken = nextToken();
  const labelsToken = nextToken();
  liveDetailToken = detailToken;
  d({ type: "select", id, selToken, detailToken, commentsToken, labelsToken });
  loadDetail(d, id, detailToken);
  fetchComments(id).then(
    (comments) => d({ type: "commentsOk", token: commentsToken, comments }),
    (e: unknown) => d({ type: "commentsErr", token: commentsToken, error: errorMessage(e) }),
  );
  fetchLabels(id).then(
    (labels) => d({ type: "labelsOk", token: labelsToken, labels }),
    (e: unknown) => d({ type: "labelsErr", token: labelsToken, error: errorMessage(e) }),
  );
}

export function retryIssue(d: Send, id: number): void {
  const token = nextToken();
  liveDetailToken = token;
  d({ type: "retryDetail", token });
  loadDetail(d, id, token);
}

export function assignIssue(d: Send, id: number, user: string, from: Origin, selToken: number): void {
  const key = nextToken();
  d({ type: "opStart", op: { key, kind: "assign", id, user, from, selToken } });
  apiAssign(id, user).then(
    (r) => d({ type: "opDone", key, value: r.assignee }),
    (e: unknown) => d({ type: "opFail", key, error: errorMessage(e) }),
  );
}

export function renameIssueTo(d: Send, id: number, title: string, selToken: number): void {
  const key = nextToken();
  d({ type: "opStart", op: { key, kind: "rename", id, title, from: "detail", selToken } });
  apiRename(id, title).then(
    (r) => d({ type: "opDone", key, value: r.title }),
    (e: unknown) => d({ type: "opFail", key, error: errorMessage(e) }),
  );
}

export function closeIssueFrom(d: Send, id: number, from: Origin, selToken: number): void {
  const key = nextToken();
  d({ type: "opStart", op: { key, kind: "close", id, from, selToken } });
  apiClose(id).then(
    () => d({ type: "opDone", key, value: "" }),
    (e: unknown) => d({ type: "opFail", key, error: errorMessage(e) }),
  );
}

export function postComment(d: Send, id: number, author: string, text: string): void {
  const key = nextToken();
  d({ type: "postStart", key, author, text });
  apiAddComment(id, author, text).then(
    (comment) => d({ type: "postDone", key, comment }),
    (e: unknown) => d({ type: "postFail", key, error: errorMessage(e) }),
  );
}

export function addLabelTo(d: Send, id: number, label: string): void {
  const key = nextToken();
  d({ type: "labelOpStart", op: { key, kind: "add", label } });
  apiAddLabel(id, label).then(
    (labels) => d({ type: "labelOpDone", key, labels }),
    (e: unknown) => d({ type: "labelOpFail", key, error: errorMessage(e) }),
  );
}

export function removeLabelFrom(d: Send, id: number, label: string): void {
  const key = nextToken();
  d({ type: "labelOpStart", op: { key, kind: "remove", label } });
  apiRemoveLabel(id, label).then(
    (labels) => d({ type: "labelOpDone", key, labels }),
    (e: unknown) => d({ type: "labelOpFail", key, error: errorMessage(e) }),
  );
}
