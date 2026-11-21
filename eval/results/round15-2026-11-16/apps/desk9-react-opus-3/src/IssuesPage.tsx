import { useEffect, useState, type Dispatch } from "react";
import * as api from "./api";
import type { Hit, Issue } from "./api";
import {
  applyLabelOps,
  applyOps,
  applyRenames,
  type Filter,
  type IssueOp,
  type IssuesAction,
  type IssuesState,
  type Source,
} from "./issuesState";
import { errorMessage, newId, type Loaded } from "./util";

type Props = {
  state: IssuesState;
  dispatch: Dispatch<IssuesAction>;
  onOpenRelated: (query: string, hits: Hit[], hit: Hit) => void;
};

function settle<T>(promise: Promise<T>, gen: number): Promise<Loaded<T>> {
  return promise.then(
    data => ({ gen, ok: true as const, data }),
    (e: unknown) => ({ gen, ok: false as const, message: errorMessage(e) }),
  );
}

type NewOp =
  | { kind: "assign"; id: number; user: string }
  | { kind: "rename"; id: number; title: string }
  | { kind: "close"; id: number };

export default function IssuesPage({ state, dispatch, onOpenRelated }: Props) {
  const [user, setUser] = useState("guest");
  const { inst, filter, listGen, sel, selGen, detailGen } = state;

  // The list of issues for the filter.
  useEffect(() => {
    let live = true;
    void settle(api.fetchIssues(filter), listGen).then(result => {
      if (live) dispatch({ type: "listLoaded", inst, filter, result });
    });
    return () => {
      live = false;
    };
  }, [dispatch, inst, filter, listGen]);

  // The selected issue's detail.
  useEffect(() => {
    if (sel === null) return;
    let live = true;
    void settle(api.fetchIssue(sel), detailGen).then(result => {
      if (live) dispatch({ type: "detailLoaded", inst, result });
    });
    return () => {
      live = false;
    };
  }, [dispatch, inst, sel, detailGen]);

  // The selected issue's comments and labels.
  useEffect(() => {
    if (sel === null) return;
    let live = true;
    void settle(api.fetchComments(sel), selGen).then(result => {
      if (live) dispatch({ type: "commentsLoaded", inst, result });
    });
    void settle(api.fetchLabels(sel), selGen).then(result => {
      if (live) dispatch({ type: "labelsLoaded", inst, result });
    });
    return () => {
      live = false;
    };
  }, [dispatch, inst, sel, selGen]);

  // Related help, searched by the issue's title as the server knows it.
  const relatedTitle = state.detail && state.detail.ok && state.detail.data ? state.detail.data.title : null;
  useEffect(() => {
    if (sel === null || relatedTitle === null) return;
    let live = true;
    const key = `${sel}|${relatedTitle}`;
    api.search(relatedTitle).then(
      hits => {
        if (live) dispatch({ type: "relatedLoaded", inst, selGen, result: { key, ok: true, hits } });
      },
      (e: unknown) => {
        if (live) dispatch({ type: "relatedLoaded", inst, selGen, result: { key, ok: false, message: errorMessage(e) } });
      },
    );
    return () => {
      live = false;
    };
  }, [dispatch, inst, sel, selGen, relatedTitle]);

  function setFilter(f: Filter) {
    if (f !== filter) dispatch({ type: "setFilter", filter: f, gen: newId() });
  }

  function startOp(newOp: NewOp, source: Source) {
    const opId = newId();
    const op: IssueOp = { ...newOp, opId, done: false };
    dispatch({ type: "opStart", op, source });
    let request: Promise<string | null>;
    if (newOp.kind === "assign") request = api.assign(newOp.id, newOp.user).then(r => r?.assignee ?? null);
    else if (newOp.kind === "rename") request = api.renameIssue(newOp.id, newOp.title).then(r => r?.title ?? null);
    else request = api.closeIssue(newOp.id).then(() => null);
    request.then(
      value => dispatch({ type: "opDone", inst, opId, value }),
      (e: unknown) => dispatch({ type: "opFailed", inst, opId, source, selGen, message: errorMessage(e) }),
    );
  }

  const list = state.list && state.list.gen === listGen ? state.list : null;

  return (
    <section className="issues">
      <div className="toolbar">
        <label>
          Current user{" "}
          <input data-testid="user" value={user} onChange={e => setUser(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Filter">
          <button data-testid="filter-open" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>
            Open
          </button>
          <button data-testid="filter-closed" aria-pressed={filter === "closed"} onClick={() => setFilter("closed")}>
            Closed
          </button>
        </div>
      </div>
      {state.rowError !== null && (
        <p className="error" role="alert" data-testid="row-error">
          row error: {state.rowError}
        </p>
      )}
      <div className="split">
        <div data-testid="list" className="list" aria-busy={!list}>
          {!list ? (
            <p className="muted">loading {filter} issues</p>
          ) : !list.ok ? (
            <p className="error">list error: {list.message}</p>
          ) : (
            <ul>
              {applyOps(list.data, state.ops, filter).map((issue: Issue) => (
                <li key={issue.id} className={issue.id === sel ? "row selected" : "row"}>
                  <button
                    className="row-main"
                    data-testid="issue"
                    aria-current={issue.id === sel ? "true" : undefined}
                    onClick={() => dispatch({ type: "select", id: issue.id, gen: newId() })}
                  >
                    #{issue.id} {issue.title} ({issue.assignee ?? "unassigned"})
                  </button>
                  <button data-testid="row-assign" onClick={() => startOp({ kind: "assign", id: issue.id, user }, "row")}>
                    assign to {user}
                  </button>
                  {filter === "open" && (
                    <button data-testid="row-close" onClick={() => startOp({ kind: "close", id: issue.id }, "row")}>
                      close
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div data-testid="detail" className="detail">
          {sel === null ? (
            <p className="muted">select an issue</p>
          ) : (
            <Detail key={selGen} id={sel} state={state} dispatch={dispatch} user={user} startOp={startOp} onOpenRelated={onOpenRelated} />
          )}
        </div>
      </div>
    </section>
  );
}

type DetailProps = {
  id: number;
  state: IssuesState;
  dispatch: Dispatch<IssuesAction>;
  user: string;
  startOp: (op: NewOp, source: Source) => void;
  onOpenRelated: (query: string, hits: Hit[], hit: Hit) => void;
};

function Detail({ id, state, dispatch, user, startOp, onOpenRelated }: DetailProps) {
  const [titleDraft, setTitleDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const { inst, selGen, errors } = state;

  const detail = state.detail && state.detail.gen === state.detailGen ? state.detail : null;
  const issue = detail && detail.ok && detail.data ? applyRenames(detail.data, state.ops) : null;

  const labelBase = state.labels && state.labels.ok ? state.labels.data : [];
  const labels = applyLabelOps(labelBase, state.labelOps);

  function rename() {
    const title = titleDraft.trim();
    if (!title) return;
    startOp({ kind: "rename", id, title }, "detail");
  }

  function post() {
    const text = commentDraft.trim();
    if (!text) return;
    const opId = newId();
    const author = user;
    dispatch({ type: "postStart", post: { opId, author, text, done: false } });
    setCommentDraft("");
    api.addComment(id, author, text).then(
      comment => dispatch({ type: "postDone", inst, selGen, opId, comment: comment ?? { author, text } }),
      (e: unknown) => dispatch({ type: "postFailed", inst, selGen, opId, message: errorMessage(e) }),
    );
  }

  function changeLabel(kind: "add" | "remove", label: string) {
    const opId = newId();
    dispatch({ type: "labelStart", op: { opId, kind, label, done: false, result: null } });
    const request = kind === "add" ? api.addLabel(id, label) : api.removeLabel(id, label);
    request.then(
      result => dispatch({ type: "labelDone", inst, selGen, opId, result }),
      (e: unknown) => dispatch({ type: "labelFailed", inst, selGen, opId, message: errorMessage(e) }),
    );
  }

  function addLabel() {
    const label = labelDraft.trim();
    if (!label || labels.includes(label)) return;
    setLabelDraft("");
    changeLabel("add", label);
  }

  return (
    <>
      <div className="detail-head">
        {!detail ? (
          <p className="muted">loading #{id}</p>
        ) : !detail.ok ? (
          <p className="error">detail error: {detail.message}</p>
        ) : !issue ? (
          <p className="error">detail error: issue #{id} not found</p>
        ) : (
          <>
            <h2>
              #{issue.id} {issue.title}
            </h2>
            <p className="body">{issue.body}</p>
          </>
        )}
        <button data-testid="retry" onClick={() => dispatch({ type: "retry", gen: newId() })}>
          retry
        </button>
      </div>

      <div className="actions">
        <button data-testid="assign" onClick={() => startOp({ kind: "assign", id, user }, "detail")}>
          assign to {user}
        </button>
        <button data-testid="close" onClick={() => startOp({ kind: "close", id }, "detail")}>
          close
        </button>
      </div>
      {errors.assign !== null && (
        <p className="error" role="alert" data-testid="assign-error">
          {errors.assign}
        </p>
      )}
      {errors.close !== null && (
        <p className="error" role="alert" data-testid="close-error">
          close error: {errors.close}
        </p>
      )}

      <form
        className="inline"
        onSubmit={e => {
          e.preventDefault();
          rename();
        }}
      >
        <input data-testid="title-input" aria-label="New title" value={titleDraft} onChange={e => setTitleDraft(e.target.value)} />
        <button data-testid="rename" type="submit">
          rename
        </button>
      </form>
      {errors.rename !== null && (
        <p className="error" role="alert" data-testid="rename-error">
          rename error: {errors.rename}
        </p>
      )}

      <h3>Labels</h3>
      <div data-testid="labels" className="labels">
        {!state.labels ? (
          <p className="muted">loading labels</p>
        ) : !state.labels.ok ? (
          <p className="error">labels error: {state.labels.message}</p>
        ) : null}
        {(state.labels === null || state.labels.ok || labels.length > 0) && (
          <ul>
            {labels.map(label => (
              <li key={label} className="chip">
                <span data-testid="label">{label}</span>
                <button data-testid="remove-label" onClick={() => changeLabel("remove", label)}>
                  remove {label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="inline"
        onSubmit={e => {
          e.preventDefault();
          addLabel();
        }}
      >
        <input data-testid="label-input" aria-label="New label" value={labelDraft} onChange={e => setLabelDraft(e.target.value)} />
        <button data-testid="add-label" type="submit">
          add label
        </button>
      </form>
      {errors.label !== null && (
        <p className="error" role="alert" data-testid="label-error">
          label error: {errors.label}
        </p>
      )}

      <h3>Comments</h3>
      <div data-testid="comments" className="comments">
        {!state.comments ? (
          <p className="muted">loading comments</p>
        ) : !state.comments.ok ? (
          <p className="error">comments error: {state.comments.message}</p>
        ) : null}
        <ul>
          {state.comments?.ok &&
            state.comments.data.map((c, i) => (
              <li key={`c${i}`} data-testid="comment">
                {c.author}: {c.text}
              </li>
            ))}
          {state.posts.map(p => (
            <li key={`p${p.opId}`} data-testid="comment" className={p.done ? undefined : "pending"}>
              {p.author}: {p.text}
              {p.done ? "" : " (sending…)"}
            </li>
          ))}
        </ul>
      </div>
      <form
        className="inline"
        onSubmit={e => {
          e.preventDefault();
          post();
        }}
      >
        <input data-testid="comment-input" aria-label="Comment" value={commentDraft} onChange={e => setCommentDraft(e.target.value)} />
        <button data-testid="post" type="submit">
          post
        </button>
      </form>
      {errors.post !== null && (
        <p className="error" role="alert" data-testid="post-error">
          post error: {errors.post}
        </p>
      )}

      {detail && detail.ok && detail.data && (
        <RelatedHelp state={state} title={detail.data.title} onOpenRelated={onOpenRelated} />
      )}
    </>
  );
}

function RelatedHelp({ state, title, onOpenRelated }: { state: IssuesState; title: string; onOpenRelated: DetailProps["onOpenRelated"] }) {
  const related = state.related && state.related.key === `${state.sel}|${title}` ? state.related : null;
  return (
    <>
      <h3>Related help</h3>
      <div data-testid="related" className="related">
        {!related ? (
          <p className="muted">finding related help</p>
        ) : !related.ok ? (
          <p className="error">related help failed: {related.message}</p>
        ) : related.hits.length === 0 ? (
          <p className="muted">no related help</p>
        ) : (
          <ul>
            {related.hits.slice(0, 3).map(hit => (
              <li key={hit.id}>
                <button data-testid="related-hit" onClick={() => onOpenRelated(title, related.hits, hit)}>
                  {hit.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
