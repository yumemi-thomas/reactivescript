import type { Comment, Hit, Issue, IssueDetail } from "./api";
import type { Loaded } from "./util";

export type Filter = "open" | "closed";
export type Source = "row" | "detail";

/** An optimistic change to an issue. `done` once the server accepted it; it is folded into the base data in order. */
export type IssueOp =
  | { opId: number; kind: "assign"; id: number; user: string; done: boolean }
  | { opId: number; kind: "rename"; id: number; title: string; done: boolean }
  | { opId: number; kind: "close"; id: number; done: boolean };

export type PostOp = { opId: number; author: string; text: string; done: boolean };

export type LabelOp = { opId: number; kind: "add" | "remove"; label: string; done: boolean; result: string[] | null };

export type DetailErrors = { assign: string | null; rename: string | null; close: string | null; post: string | null; label: string | null };

export type Related = { key: string; ok: true; hits: Hit[] } | { key: string; ok: false; message: string };

export type IssuesState = {
  /** instance of the issues page; bumped whenever the page is discarded */
  inst: number;
  /** last open-issue count shown on the tab; survives the page being discarded */
  lastCount: number | null;
  filter: Filter;
  listGen: number;
  list: (Loaded<Issue[]> & { filter: Filter }) | null;
  ops: IssueOp[];
  rowError: string | null;
  sel: number | null;
  selGen: number;
  detailGen: number;
  detail: Loaded<IssueDetail | null> | null;
  comments: Loaded<Comment[]> | null;
  posts: PostOp[];
  labels: Loaded<string[]> | null;
  labelOps: LabelOp[];
  related: Related | null;
  errors: DetailErrors;
};

const noErrors: DetailErrors = { assign: null, rename: null, close: null, post: null, label: null };

export function initialIssues(lastCount: number | null = null, inst = 0): IssuesState {
  return {
    inst,
    lastCount,
    filter: "open",
    listGen: 0,
    list: null,
    ops: [],
    rowError: null,
    sel: null,
    selGen: 0,
    detailGen: 0,
    detail: null,
    comments: null,
    posts: [],
    labels: null,
    labelOps: [],
    related: null,
    errors: noErrors,
  };
}

export type IssuesAction =
  | { type: "reset" }
  | { type: "setFilter"; filter: Filter; gen: number }
  | { type: "listLoaded"; inst: number; filter: Filter; result: Loaded<Issue[]> }
  | { type: "select"; id: number; gen: number }
  | { type: "retry"; gen: number }
  | { type: "detailLoaded"; inst: number; result: Loaded<IssueDetail | null> }
  | { type: "commentsLoaded"; inst: number; result: Loaded<Comment[]> }
  | { type: "labelsLoaded"; inst: number; result: Loaded<string[]> }
  | { type: "relatedLoaded"; inst: number; selGen: number; result: Related }
  | { type: "opStart"; op: IssueOp; source: Source }
  | { type: "opDone"; inst: number; opId: number; value: string | null }
  | { type: "opFailed"; inst: number; opId: number; source: Source; selGen: number; message: string }
  | { type: "postStart"; post: PostOp }
  | { type: "postDone"; inst: number; selGen: number; opId: number; comment: Comment }
  | { type: "postFailed"; inst: number; selGen: number; opId: number; message: string }
  | { type: "labelStart"; op: LabelOp }
  | { type: "labelDone"; inst: number; selGen: number; opId: number; result: string[] }
  | { type: "labelFailed"; inst: number; selGen: number; opId: number; message: string };

function applyOp(items: Issue[], op: IssueOp, filter: Filter): Issue[] {
  switch (op.kind) {
    case "assign":
      return items.map(i => (i.id === op.id ? { ...i, assignee: op.user } : i));
    case "rename":
      return items.map(i => (i.id === op.id ? { ...i, title: op.title } : i));
    case "close":
      return filter === "open" ? items.filter(i => i.id !== op.id) : items;
  }
}

export function applyOps(items: Issue[], ops: IssueOp[], filter: Filter): Issue[] {
  return ops.reduce((acc, op) => applyOp(acc, op, filter), items);
}

export function applyRenames(detail: IssueDetail, ops: IssueOp[]): IssueDetail {
  let title = detail.title;
  for (const op of ops) if (op.kind === "rename" && op.id === detail.id) title = op.title;
  return title === detail.title ? detail : { ...detail, title };
}

function applyLabelOp(labels: string[], op: LabelOp): string[] {
  if (op.kind === "add") return labels.includes(op.label) ? labels : [...labels, op.label];
  return labels.filter(l => l !== op.label);
}

export function applyLabelOps(labels: string[], ops: LabelOp[]): string[] {
  return ops.reduce(applyLabelOp, labels);
}

/** Folds the accepted operations at the head of the queue into the base list and detail. */
function foldOps(state: IssuesState, ops: IssueOp[]): IssuesState {
  let { list, detail } = state;
  let rest = ops;
  while (rest.length > 0 && rest[0].done) {
    const op = rest[0];
    if (list && list.ok) list = { ...list, data: applyOp(list.data, op, list.filter) };
    if (detail && detail.ok && detail.data) detail = { ...detail, data: applyRenames(detail.data, [op]) };
    rest = rest.slice(1);
  }
  return { ...state, ops: rest, list, detail };
}

function foldPosts(state: IssuesState, posts: PostOp[]): IssuesState {
  const comments = state.comments;
  if (!comments || !comments.ok) return { ...state, posts };
  let data = comments.data;
  let rest = posts;
  while (rest.length > 0 && rest[0].done) {
    data = [...data, { author: rest[0].author, text: rest[0].text }];
    rest = rest.slice(1);
  }
  return { ...state, posts: rest, comments: { ...comments, data } };
}

function foldLabels(state: IssuesState, ops: LabelOp[]): IssuesState {
  const labels = state.labels;
  if (!labels || !labels.ok) return { ...state, labelOps: ops };
  let data = labels.data;
  let rest = ops;
  while (rest.length > 0 && rest[0].done) {
    const op = rest[0];
    rest = rest.slice(1);
    // Once every change has settled, the server's answer to the last one is the truth.
    data = rest.length === 0 && op.result ? op.result : applyLabelOp(data, op);
  }
  return { ...state, labelOps: rest, labels: { ...labels, data } };
}

function reduce(state: IssuesState, action: IssuesAction): IssuesState {
  if ("inst" in action && action.inst !== state.inst) return state;
  switch (action.type) {
    case "reset":
      return initialIssues(state.lastCount, state.inst + 1);
    case "setFilter":
      if (action.filter === state.filter) return state;
      return { ...state, filter: action.filter, listGen: action.gen };
    case "listLoaded":
      if (action.result.gen !== state.listGen || action.filter !== state.filter) return state;
      return { ...state, list: { ...action.result, filter: action.filter } };
    case "select":
      if (action.id === state.sel) return state;
      return {
        ...state,
        sel: action.id,
        selGen: action.gen,
        detailGen: action.gen,
        detail: null,
        comments: null,
        posts: [],
        labels: null,
        labelOps: [],
        related: null,
        errors: noErrors,
      };
    case "retry":
      if (state.sel === null) return state;
      return { ...state, detailGen: action.gen };
    case "detailLoaded":
      if (action.result.gen !== state.detailGen) return state;
      return { ...state, detail: action.result };
    case "commentsLoaded":
      if (action.result.gen !== state.selGen) return state;
      return foldPosts({ ...state, comments: action.result }, state.posts);
    case "labelsLoaded":
      if (action.result.gen !== state.selGen) return state;
      return foldLabels({ ...state, labels: action.result }, state.labelOps);
    case "relatedLoaded":
      if (action.selGen !== state.selGen) return state;
      return { ...state, related: action.result };
    case "opStart": {
      const next = { ...state, ops: [...state.ops, action.op] };
      if (action.source === "row") return { ...next, rowError: null };
      return { ...next, errors: { ...state.errors, [action.op.kind]: null } };
    }
    case "opDone": {
      const ops = state.ops.map(o => {
        if (o.opId !== action.opId) return o;
        if (o.kind === "assign") return { ...o, user: action.value ?? o.user, done: true };
        if (o.kind === "rename") return { ...o, title: action.value ?? o.title, done: true };
        return { ...o, done: true };
      });
      return foldOps(state, ops);
    }
    case "opFailed": {
      const op = state.ops.find(o => o.opId === action.opId);
      if (!op) return state;
      let next = foldOps(state, state.ops.filter(o => o.opId !== action.opId));
      if (action.source === "row") next = { ...next, rowError: action.message };
      else if (action.selGen === state.selGen) next = { ...next, errors: { ...next.errors, [op.kind]: action.message } };
      return next;
    }
    case "postStart":
      return { ...state, posts: [...state.posts, action.post], errors: { ...state.errors, post: null } };
    case "postDone":
      if (action.selGen !== state.selGen) return state;
      return foldPosts(
        state,
        state.posts.map(p => (p.opId === action.opId ? { ...p, author: action.comment.author, text: action.comment.text, done: true } : p)),
      );
    case "postFailed":
      if (action.selGen !== state.selGen) return state;
      return {
        ...foldPosts(state, state.posts.filter(p => p.opId !== action.opId)),
        errors: { ...state.errors, post: action.message },
      };
    case "labelStart":
      return { ...state, labelOps: [...state.labelOps, action.op], errors: { ...state.errors, label: null } };
    case "labelDone":
      if (action.selGen !== state.selGen) return state;
      return foldLabels(
        state,
        state.labelOps.map(o => (o.opId === action.opId ? { ...o, done: true, result: action.result } : o)),
      );
    case "labelFailed":
      if (action.selGen !== state.selGen) return state;
      return {
        ...foldLabels(state, state.labelOps.filter(o => o.opId !== action.opId)),
        errors: { ...state.errors, label: action.message },
      };
  }
}

/** The open issues as the list shows them, or null while the list is not showing loaded open issues. */
export function shownOpenCount(state: IssuesState): number | null {
  const { list } = state;
  if (state.filter !== "open" || !list || list.gen !== state.listGen || !list.ok) return null;
  return applyOps(list.data, state.ops, "open").length;
}

export function issuesReducer(state: IssuesState, action: IssuesAction): IssuesState {
  const next = reduce(state, action);
  if (next === state) return state;
  const count = shownOpenCount(next);
  return count === null || count === next.lastCount ? next : { ...next, lastCount: count };
}
