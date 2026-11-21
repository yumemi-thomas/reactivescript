import { useEffect, useReducer, useRef } from "react";
import type { Dispatch } from "react";
import {
  addComment,
  addLabel,
  assign,
  closeIssue,
  fetchComments,
  fetchIssue,
  fetchIssues,
  fetchLabels,
  removeLabel,
  renameIssue,
  search,
} from "./api.js";
import type { Comment, Hit, Issue, IssueDetail } from "./api.js";
import type { HelpSeed } from "./HelpPage";
import { messageOf } from "./errors";
import type { Result } from "./errors";

type Filter = "open" | "closed";
type Source = "detail" | "row";
type ErrorKey = "assign" | "rename" | "close" | "post" | "label";

interface Problem {
  id: number;
  text: string;
}

/** A server call the user started, not yet answered. */
type NewOp =
  | { id: number; source: Source; kind: "assign"; user: string }
  | { id: number; source: Source; kind: "rename"; title: string }
  | { id: number; source: Source; kind: "close" }
  | { id: number; source: "detail"; kind: "comment"; author: string; text: string }
  | { id: number; source: "detail"; kind: "label-add"; label: string }
  | { id: number; source: "detail"; kind: "label-remove"; label: string };

type Op = NewOp & { seq: number };

/** What the server accepted, to be kept on top of the fetched data. */
type Commit =
  | { kind: "assignee"; id: number; assignee: string }
  | { kind: "title"; id: number; title: string }
  | { kind: "closed"; id: number }
  | { kind: "comment"; id: number; comment: Comment }
  | { kind: "labels"; id: number; labels: string[] };

interface Confirmed {
  titles: ReadonlyMap<number, string>;
  assignees: ReadonlyMap<number, string>;
  closed: ReadonlySet<number>;
  comments: ReadonlyMap<number, readonly Comment[]>;
  labels: ReadonlyMap<number, readonly string[]>;
}

interface State {
  user: string;
  filter: Filter;
  list: Result<Issue[]> | null;
  selected: number | null;
  attempt: number;
  detail: Result<IssueDetail | null> | null;
  titleDraft: string;
  commentDraft: string;
  labelDraft: string;
  ops: readonly Op[];
  confirmed: Confirmed;
  comments: Result<Comment[]> | null;
  labels: Result<string[]> | null;
  related: { query: string; result: Result<Hit[]> } | null;
  errors: Partial<Record<ErrorKey, Problem>>;
  rowError: string | null;
}

type Action =
  | { type: "user"; user: string }
  | { type: "filter"; filter: Filter }
  | { type: "list"; filter: Filter; result: Result<Issue[]> }
  | { type: "select"; id: number }
  | { type: "retry" }
  | { type: "detail"; id: number; result: Result<IssueDetail | null> }
  | { type: "title-draft"; value: string }
  | { type: "comment-draft"; value: string }
  | { type: "label-draft"; value: string }
  | { type: "comments"; id: number; result: Result<Comment[]> }
  | { type: "labels"; id: number; result: Result<string[]> }
  | { type: "related"; query: string; result: Result<Hit[]> }
  | { type: "op/start"; seq: number; op: NewOp }
  | { type: "op/ok"; seq: number; commit: Commit }
  | { type: "op/fail"; seq: number; message: string };

function initialState(): State {
  return {
    user: "guest",
    filter: "open",
    list: null,
    selected: null,
    attempt: 0,
    detail: null,
    titleDraft: "",
    commentDraft: "",
    labelDraft: "",
    ops: [],
    confirmed: {
      titles: new Map<number, string>(),
      assignees: new Map<number, string>(),
      closed: new Set<number>(),
      comments: new Map<number, readonly Comment[]>(),
      labels: new Map<number, readonly string[]>(),
    },
    comments: null,
    labels: null,
    related: null,
    errors: {},
    rowError: null,
  };
}

function relatedQueryOf(state: State): string | null {
  return state.detail?.kind === "ok" && state.detail.value !== null ? state.detail.value.title : null;
}

function applyCommit(confirmed: Confirmed, commit: Commit): Confirmed {
  switch (commit.kind) {
    case "assignee":
      return { ...confirmed, assignees: new Map(confirmed.assignees).set(commit.id, commit.assignee) };
    case "title":
      return { ...confirmed, titles: new Map(confirmed.titles).set(commit.id, commit.title) };
    case "closed":
      return { ...confirmed, closed: new Set(confirmed.closed).add(commit.id) };
    case "comment": {
      const previous = confirmed.comments.get(commit.id) ?? [];
      return { ...confirmed, comments: new Map(confirmed.comments).set(commit.id, [...previous, commit.comment]) };
    }
    case "labels":
      return { ...confirmed, labels: new Map(confirmed.labels).set(commit.id, commit.labels) };
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "user":
      return { ...state, user: action.user };
    case "filter":
      if (action.filter === state.filter) return state;
      return { ...state, filter: action.filter, list: null };
    case "list":
      if (action.filter !== state.filter) return state;
      return { ...state, list: action.result };
    case "select":
      if (action.id === state.selected) return state;
      return {
        ...state,
        selected: action.id,
        attempt: 0,
        detail: null,
        titleDraft: "",
        comments: null,
        labels: null,
        related: null,
        errors: {},
      };
    case "retry":
      return { ...state, attempt: state.attempt + 1, detail: null, related: null };
    case "detail":
      if (action.id !== state.selected) return state;
      return { ...state, detail: action.result };
    case "title-draft":
      return { ...state, titleDraft: action.value };
    case "comment-draft":
      return { ...state, commentDraft: action.value };
    case "label-draft":
      return { ...state, labelDraft: action.value };
    case "comments":
      if (action.id !== state.selected) return state;
      return { ...state, comments: action.result };
    case "labels":
      if (action.id !== state.selected) return state;
      return { ...state, labels: action.result };
    case "related":
      if (action.query !== relatedQueryOf(state)) return state;
      return { ...state, related: { query: action.query, result: action.result } };
    case "op/start": {
      const op: Op = { ...action.op, seq: action.seq };
      const next: State = { ...state, ops: [...state.ops, op] };
      if (op.source === "row") return { ...next, rowError: null };
      switch (op.kind) {
        case "assign":
          return { ...next, errors: { ...next.errors, assign: undefined } };
        case "rename":
          return { ...next, errors: { ...next.errors, rename: undefined } };
        case "close":
          return { ...next, errors: { ...next.errors, close: undefined } };
        case "comment":
          return { ...next, commentDraft: "", errors: { ...next.errors, post: undefined } };
        case "label-add":
          return { ...next, labelDraft: "", errors: { ...next.errors, label: undefined } };
        case "label-remove":
          return { ...next, errors: { ...next.errors, label: undefined } };
      }
      return next;
    }
    case "op/ok": {
      const ops = state.ops.filter((op) => op.seq !== action.seq);
      return { ...state, ops, confirmed: applyCommit(state.confirmed, action.commit) };
    }
    case "op/fail": {
      const op = state.ops.find((o) => o.seq === action.seq);
      if (op === undefined) return state;
      const next: State = { ...state, ops: state.ops.filter((o) => o !== op) };
      if (op.source === "row") return { ...next, rowError: `row error: ${action.message}` };
      const problem = (prefix: string): Problem => ({ id: op.id, text: `${prefix}: ${action.message}` });
      switch (op.kind) {
        case "assign":
          return { ...next, errors: { ...next.errors, assign: problem("assign error") } };
        case "rename":
          return { ...next, errors: { ...next.errors, rename: problem("rename error") } };
        case "close":
          return { ...next, errors: { ...next.errors, close: problem("close error") } };
        case "comment":
          return { ...next, errors: { ...next.errors, post: problem("post error") } };
        case "label-add":
        case "label-remove":
          return { ...next, errors: { ...next.errors, label: problem("label error") } };
      }
      return next;
    }
  }
}

// Views: the fetched data with what the user did on top (pending first, then accepted, in order).

function titleFor(state: State, id: number, base: string): string {
  let title = state.confirmed.titles.get(id) ?? base;
  for (const op of state.ops) {
    if (op.id === id && op.kind === "rename") title = op.title;
  }
  return title;
}

function assigneeFor(state: State, id: number, base: string | null): string | null {
  let assignee: string | null = state.confirmed.assignees.get(id) ?? base;
  for (const op of state.ops) {
    if (op.id === id && op.kind === "assign") assignee = op.user;
  }
  return assignee;
}

function isClosed(state: State, id: number): boolean {
  return state.confirmed.closed.has(id) || state.ops.some((op) => op.id === id && op.kind === "close");
}

function labelsFor(state: State, id: number): string[] {
  const base = state.confirmed.labels.get(id) ?? (state.labels?.kind === "ok" ? state.labels.value : []);
  let labels = [...base];
  for (const op of state.ops) {
    if (op.id !== id) continue;
    if (op.kind === "label-add" && !labels.includes(op.label)) labels = [...labels, op.label];
    if (op.kind === "label-remove") labels = labels.filter((label) => label !== op.label);
  }
  return labels;
}

interface Line {
  key: string;
  text: string;
}

function commentLines(state: State, id: number): Line[] {
  const base = state.comments?.kind === "ok" ? state.comments.value : [];
  const accepted = state.confirmed.comments.get(id) ?? [];
  const lines: Line[] = [...base, ...accepted].map((c, i) => ({ key: `c${i}`, text: `${c.author}: ${c.text}` }));
  for (const op of state.ops) {
    if (op.id === id && op.kind === "comment") {
      lines.push({ key: `p${op.seq}`, text: `${op.author}: ${op.text} (sending…)` });
    }
  }
  return lines;
}

function problemOf(state: State, key: ErrorKey): string | null {
  const problem = state.errors[key];
  return problem !== undefined && problem.id === state.selected ? problem.text : null;
}

function Alert({ text }: { text: string | null }) {
  return text === null ? null : <p role="alert">{text}</p>;
}

function RelatedHelp({ result, onOpen }: { result: Result<Hit[]> | null; onOpen: (hit: Hit) => void }) {
  return (
    <section data-testid="related" aria-label="Related help">
      {result === null && <p>finding related help</p>}
      {result?.kind === "error" && <Alert text={`related help failed: ${result.message}`} />}
      {result?.kind === "ok" && result.value.length === 0 && <p>no related help</p>}
      {result?.kind === "ok" && result.value.length > 0 && (
        <ul>
          {result.value.slice(0, 3).map((hit) => (
            <li key={hit.id}>
              <button type="button" data-testid="related-hit" onClick={() => onOpen(hit)}>
                {hit.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface DetailBodyProps {
  id: number;
  state: State;
  dispatch: Dispatch<Action>;
  onAssign: () => void;
  onRename: () => void;
  onClose: () => void;
  onPost: () => void;
  onAddLabel: () => void;
  onRemoveLabel: (label: string) => void;
  onOpenHelp: (seed: HelpSeed) => void;
}

function DetailBody({
  id,
  state,
  dispatch,
  onAssign,
  onRename,
  onClose,
  onPost,
  onAddLabel,
  onRemoveLabel,
  onOpenHelp,
}: DetailBodyProps) {
  const detail = state.detail;
  const issue = detail?.kind === "ok" ? detail.value : null;
  const title = issue === null ? null : titleFor(state, id, issue.title);
  const related =
    issue !== null && state.related !== null && state.related.query === issue.title ? state.related.result : null;
  const labelsLoading = state.labels === null && !state.confirmed.labels.has(id);

  return (
    <>
      {detail === null && <p>{`loading #${id}`}</p>}
      {detail?.kind === "error" && <Alert text={`detail error: ${detail.message}`} />}
      {detail?.kind === "ok" && detail.value === null && <Alert text={`detail error: issue #${id} not found`} />}
      {issue !== null && title !== null && (
        <>
          <h2>{`#${id} ${title}`}</h2>
          <p>{issue.body}</p>
        </>
      )}
      <button type="button" data-testid="retry" onClick={() => dispatch({ type: "retry" })}>
        retry
      </button>

      <div>
        <button type="button" data-testid="assign" onClick={onAssign}>
          {`assign to ${state.user}`}
        </button>
        <Alert text={problemOf(state, "assign")} />
      </div>

      <div>
        <input
          data-testid="title-input"
          aria-label="New title"
          value={state.titleDraft}
          onChange={(e) => dispatch({ type: "title-draft", value: e.target.value })}
        />
        <button type="button" data-testid="rename" onClick={onRename}>
          rename
        </button>
        <Alert text={problemOf(state, "rename")} />
      </div>

      <div>
        <button type="button" data-testid="close" onClick={onClose}>
          close
        </button>
        <Alert text={problemOf(state, "close")} />
      </div>

      {issue !== null && (
        <RelatedHelp result={related} onOpen={(hit) => onOpenHelp({ query: issue.title, hit })} />
      )}

      <section data-testid="comments" aria-label="Comments">
        {state.comments === null && <p>loading comments</p>}
        {state.comments?.kind === "error" && <Alert text={`comments error: ${state.comments.message}`} />}
        <ul>
          {commentLines(state, id).map((line) => (
            <li key={line.key} data-testid="comment">
              {line.text}
            </li>
          ))}
        </ul>
        <input
          data-testid="comment-input"
          aria-label="Comment"
          value={state.commentDraft}
          onChange={(e) => dispatch({ type: "comment-draft", value: e.target.value })}
        />
        <button type="button" data-testid="post" onClick={onPost}>
          post
        </button>
        <Alert text={problemOf(state, "post")} />
      </section>

      <section data-testid="labels" aria-label="Labels">
        {labelsLoading && <p>loading labels</p>}
        {state.labels?.kind === "error" && <Alert text={`labels error: ${state.labels.message}`} />}
        <ul>
          {labelsFor(state, id).map((label) => (
            <li key={label}>
              <span data-testid="label">{label}</span>{" "}
              <button type="button" data-testid="remove-label" onClick={() => onRemoveLabel(label)}>
                {`remove ${label}`}
              </button>
            </li>
          ))}
        </ul>
        <input
          data-testid="label-input"
          aria-label="Label"
          value={state.labelDraft}
          onChange={(e) => dispatch({ type: "label-draft", value: e.target.value })}
        />
        <button type="button" data-testid="add-label" onClick={onAddLabel}>
          add
        </button>
        <Alert text={problemOf(state, "label")} />
      </section>
    </>
  );
}

export interface IssuesPageProps {
  onOpenCount: (count: number) => void;
  onOpenHelp: (seed: HelpSeed) => void;
}

export default function IssuesPage({ onOpenCount, onOpenHelp }: IssuesPageProps) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const seqRef = useRef(0);
  const { filter, selected, attempt } = state;
  const relatedQuery = relatedQueryOf(state);
  const user = state.user.trim();

  useEffect(() => {
    let stale = false;
    fetchIssues(filter).then(
      (value) => {
        if (!stale) dispatch({ type: "list", filter, result: { kind: "ok", value } });
      },
      (error: unknown) => {
        if (!stale) dispatch({ type: "list", filter, result: { kind: "error", message: messageOf(error) } });
      },
    );
    return () => {
      stale = true;
    };
  }, [filter]);

  useEffect(() => {
    if (selected === null) return;
    const id = selected;
    let stale = false;
    fetchIssue(id).then(
      (value) => {
        if (!stale) dispatch({ type: "detail", id, result: { kind: "ok", value } });
      },
      (error: unknown) => {
        if (!stale) dispatch({ type: "detail", id, result: { kind: "error", message: messageOf(error) } });
      },
    );
    return () => {
      stale = true;
    };
  }, [selected, attempt]);

  useEffect(() => {
    if (selected === null) return;
    const id = selected;
    let stale = false;
    fetchComments(id).then(
      (value) => {
        if (!stale) dispatch({ type: "comments", id, result: { kind: "ok", value } });
      },
      (error: unknown) => {
        if (!stale) dispatch({ type: "comments", id, result: { kind: "error", message: messageOf(error) } });
      },
    );
    return () => {
      stale = true;
    };
  }, [selected]);

  useEffect(() => {
    if (selected === null) return;
    const id = selected;
    let stale = false;
    fetchLabels(id).then(
      (value) => {
        if (!stale) dispatch({ type: "labels", id, result: { kind: "ok", value } });
      },
      (error: unknown) => {
        if (!stale) dispatch({ type: "labels", id, result: { kind: "error", message: messageOf(error) } });
      },
    );
    return () => {
      stale = true;
    };
  }, [selected]);

  useEffect(() => {
    if (relatedQuery === null) return;
    const query = relatedQuery;
    let stale = false;
    search(query).then(
      (value) => {
        if (!stale) dispatch({ type: "related", query, result: { kind: "ok", value } });
      },
      (error: unknown) => {
        if (!stale) dispatch({ type: "related", query, result: { kind: "error", message: messageOf(error) } });
      },
    );
    return () => {
      stale = true;
    };
  }, [relatedQuery]);

  const rows = state.list?.kind === "ok" ? state.list.value : null;
  const visibleRows =
    rows === null
      ? null
      : rows
          .map((issue) => ({
            id: issue.id,
            title: titleFor(state, issue.id, issue.title),
            assignee: assigneeFor(state, issue.id, issue.assignee),
          }))
          .filter((row) => filter === "closed" || !isClosed(state, row.id));
  const openCount = filter === "open" && visibleRows !== null ? visibleRows.length : null;

  useEffect(() => {
    if (openCount !== null) onOpenCount(openCount);
  }, [openCount, onOpenCount]);

  // Each server call is recorded as pending, then either accepted or declined.
  function launch(op: NewOp, request: Promise<Commit>) {
    seqRef.current += 1;
    const seq = seqRef.current;
    dispatch({ type: "op/start", seq, op });
    request.then(
      (commit) => dispatch({ type: "op/ok", seq, commit }),
      (error: unknown) => dispatch({ type: "op/fail", seq, message: messageOf(error) }),
    );
  }

  function assignTo(id: number, source: Source) {
    if (user === "") return;
    launch(
      { id, source, kind: "assign", user },
      assign(id, user).then((r): Commit => ({ kind: "assignee", id, assignee: r.assignee })),
    );
  }

  function closeOne(id: number, source: Source) {
    launch({ id, source, kind: "close" }, closeIssue(id).then((): Commit => ({ kind: "closed", id })));
  }

  function renameTo(id: number) {
    const title = state.titleDraft.trim();
    if (title === "") return;
    launch(
      { id, source: "detail", kind: "rename", title },
      renameIssue(id, title).then((r): Commit => ({ kind: "title", id, title: r.title })),
    );
  }

  function postTo(id: number) {
    const text = state.commentDraft.trim();
    if (user === "" || text === "") return;
    launch(
      { id, source: "detail", kind: "comment", author: user, text },
      addComment(id, user, text).then((comment): Commit => ({ kind: "comment", id, comment })),
    );
  }

  function addLabelTo(id: number) {
    const label = state.labelDraft.trim();
    if (label === "" || labelsFor(state, id).includes(label)) return;
    launch(
      { id, source: "detail", kind: "label-add", label },
      addLabel(id, label).then((labels): Commit => ({ kind: "labels", id, labels })),
    );
  }

  function removeLabelFrom(id: number, label: string) {
    launch(
      { id, source: "detail", kind: "label-remove", label },
      removeLabel(id, label).then((labels): Commit => ({ kind: "labels", id, labels })),
    );
  }

  return (
    <section aria-label="Issues">
      <div>
        <label>
          Current user{" "}
          <input
            data-testid="user"
            value={state.user}
            onChange={(e) => dispatch({ type: "user", user: e.target.value })}
          />
        </label>
      </div>

      <div role="group" aria-label="Filter">
        <button
          type="button"
          data-testid="filter-open"
          aria-pressed={filter === "open"}
          onClick={() => dispatch({ type: "filter", filter: "open" })}
        >
          Open
        </button>
        <button
          type="button"
          data-testid="filter-closed"
          aria-pressed={filter === "closed"}
          onClick={() => dispatch({ type: "filter", filter: "closed" })}
        >
          Closed
        </button>
      </div>

      <div data-testid="list" aria-live="polite">
        {state.list === null && <p>{`loading ${filter} issues`}</p>}
        {state.list?.kind === "error" && <Alert text={`list error: ${state.list.message}`} />}
        {visibleRows !== null && (
          <ul>
            {visibleRows.map((row) => (
              <li key={row.id}>
                <button type="button" data-testid="issue" onClick={() => dispatch({ type: "select", id: row.id })}>
                  {`#${row.id} ${row.title} (${row.assignee ?? "unassigned"})`}
                </button>
                <button type="button" data-testid="row-assign" onClick={() => assignTo(row.id, "row")}>
                  {`assign to ${state.user}`}
                </button>
                {filter === "open" && (
                  <button type="button" data-testid="row-close" onClick={() => closeOne(row.id, "row")}>
                    close
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.rowError !== null && (
        <p role="alert" data-testid="row-error">
          {state.rowError}
        </p>
      )}

      <section data-testid="detail" aria-label="Issue detail">
        {selected === null ? (
          <p>select an issue</p>
        ) : (
          <DetailBody
            id={selected}
            state={state}
            dispatch={dispatch}
            onAssign={() => assignTo(selected, "detail")}
            onRename={() => renameTo(selected)}
            onClose={() => closeOne(selected, "detail")}
            onPost={() => postTo(selected)}
            onAddLabel={() => addLabelTo(selected)}
            onRemoveLabel={(label) => removeLabelFrom(selected, label)}
            onOpenHelp={onOpenHelp}
          />
        )}
      </section>
    </section>
  );
}
