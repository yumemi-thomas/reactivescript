import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { Issue } from "../api.js";
import {
  detailTitle,
  visibleComments,
  visibleIssues,
  visibleLabels,
  type issuesMachine,
} from "../machines/issues";

type IssuesActor = ActorRefFrom<typeof issuesMachine>;
type IssuesSnapshot = ReturnType<IssuesActor["getSnapshot"]>;

const rowText = (issue: Issue) => `#${issue.id} ${issue.title} (${issue.assignee ?? "unassigned"})`;

export function IssuesPage({ actor }: { actor: IssuesActor }) {
  const snapshot = useSelector(actor, s => s);
  const { context } = snapshot;
  const { send } = actor;

  return (
    <div>
      <div className="toolbar">
        <label>
          User{" "}
          <input
            data-testid="user"
            value={context.user}
            onChange={e => send({ type: "user.change", value: e.target.value })}
          />
        </label>
        <button
          type="button"
          data-testid="filter-open"
          aria-pressed={context.filter === "open"}
          onClick={() => send({ type: "filter.set", filter: "open" })}
        >
          open
        </button>
        <button
          type="button"
          data-testid="filter-closed"
          aria-pressed={context.filter === "closed"}
          onClick={() => send({ type: "filter.set", filter: "closed" })}
        >
          closed
        </button>
      </div>
      {context.rowError !== null && (
        <p className="error" data-testid="row-error" role="alert">
          row error: {context.rowError}
        </p>
      )}
      <div className="issues">
        <IssueList snapshot={snapshot} actor={actor} />
        <Detail snapshot={snapshot} actor={actor} />
      </div>
    </div>
  );
}

function IssueList({ snapshot, actor }: { snapshot: IssuesSnapshot; actor: IssuesActor }) {
  const { context } = snapshot;
  const { send } = actor;
  let body;
  if (snapshot.matches({ list: "loading" })) {
    body = <p className="muted">loading {context.filter} issues</p>;
  } else if (snapshot.matches({ list: "failed" })) {
    body = (
      <p className="error">
        list error: {context.listError}{" "}
        <button type="button" data-testid="retry-list" onClick={() => send({ type: "list.retry" })}>
          try again
        </button>
      </p>
    );
  } else {
    const rows = visibleIssues(context);
    body =
      rows.length === 0 ? (
        <p className="muted">no {context.filter} issues</p>
      ) : (
        <ul className="rows">
          {rows.map(issue => (
            <li key={issue.id}>
              <button
                type="button"
                data-testid="issue"
                className={issue.id === context.selectedId ? "row-main selected" : "row-main"}
                aria-current={issue.id === context.selectedId}
                onClick={() => send({ type: "select", id: issue.id })}
              >
                {rowText(issue)}
              </button>
              <button
                type="button"
                data-testid="row-assign"
                onClick={() => send({ type: "assign", source: "row", id: issue.id })}
              >
                assign to {context.user}
              </button>
              {context.filter === "open" && (
                <button
                  type="button"
                  data-testid="row-close"
                  onClick={() => send({ type: "close", source: "row", id: issue.id })}
                >
                  close
                </button>
              )}
            </li>
          ))}
        </ul>
      );
  }
  return (
    <section className="panel" data-testid="list" aria-label="issues">
      {body}
    </section>
  );
}

function Detail({ snapshot, actor }: { snapshot: IssuesSnapshot; actor: IssuesActor }) {
  const { context } = snapshot;
  const { send } = actor;
  const id = context.selectedId;

  if (id === null || !snapshot.matches({ detail: "selected" })) {
    return (
      <section className="panel" data-testid="detail" aria-label="detail">
        <p className="muted">select an issue</p>
      </section>
    );
  }

  const issueState = (s: "loading" | "loaded" | "notFound" | "failed") =>
    snapshot.matches({ detail: { selected: { issue: s } } });

  let head;
  if (issueState("loading")) head = <p className="muted">loading #{id}</p>;
  else if (issueState("notFound")) head = <p className="error">detail error: issue #{id} not found</p>;
  else if (issueState("failed")) head = <p className="error">detail error: {context.detailError}</p>;
  else
    head = (
      <>
        <h2>
          #{id} {detailTitle(context)}
        </h2>
        <p>{context.detail?.body}</p>
      </>
    );

  const { errors } = context;
  return (
    <section className="panel" data-testid="detail" aria-label="detail">
      {head}
      <div className="form-row">
        <button type="button" data-testid="retry" onClick={() => send({ type: "detail.retry" })}>
          retry
        </button>
        <button type="button" data-testid="assign" onClick={() => send({ type: "assign", source: "detail", id })}>
          assign to {context.user}
        </button>
        <button type="button" data-testid="close" onClick={() => send({ type: "close", source: "detail", id })}>
          close
        </button>
      </div>
      <form
        className="form-row"
        onSubmit={e => {
          e.preventDefault();
          send({ type: "rename" });
        }}
      >
        <input
          data-testid="title-input"
          aria-label="new title"
          placeholder="new title"
          value={context.titleDraft}
          onChange={e => send({ type: "title.change", value: e.target.value })}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {errors.assign !== null && <p className="error" data-testid="assign-error">assign error: {errors.assign}</p>}
      {errors.rename !== null && <p className="error" data-testid="rename-error">rename error: {errors.rename}</p>}
      {errors.close !== null && <p className="error" data-testid="close-error">close error: {errors.close}</p>}

      <Labels snapshot={snapshot} actor={actor} />
      <Comments snapshot={snapshot} actor={actor} />
      {issueState("loaded") && <Related snapshot={snapshot} actor={actor} />}
    </section>
  );
}

function Comments({ snapshot, actor }: { snapshot: IssuesSnapshot; actor: IssuesActor }) {
  const { context } = snapshot;
  const { send } = actor;
  const rows = visibleComments(context);
  const pending = rows.filter(r => r.sending);
  let body;
  if (snapshot.matches({ detail: { selected: { comments: "loading" } } })) {
    body = <p className="muted">loading comments</p>;
  } else if (snapshot.matches({ detail: { selected: { comments: "failed" } } })) {
    body = <p className="error">comments error: {context.commentsError}</p>;
  }
  const shown = body ? pending : rows;
  return (
    <div className="section">
      <h3>Comments</h3>
      <div data-testid="comments">
        {body}
        {shown.length > 0 && (
          <ul className="rows">
            {shown.map(c => (
              <li key={c.key} data-testid="comment">
                {c.author}: {c.text}
                {c.sending ? " (sending…)" : ""}
              </li>
            ))}
          </ul>
        )}
        {!body && rows.length === 0 && <p className="muted">no comments</p>}
      </div>
      <form
        className="form-row"
        onSubmit={e => {
          e.preventDefault();
          send({ type: "post" });
        }}
      >
        <input
          data-testid="comment-input"
          aria-label="comment"
          placeholder="add a comment"
          value={context.commentDraft}
          onChange={e => send({ type: "comment.change", value: e.target.value })}
        />
        <button type="submit" data-testid="post">
          post
        </button>
      </form>
      {context.errors.post !== null && <p className="error" data-testid="post-error">post error: {context.errors.post}</p>}
    </div>
  );
}

function Labels({ snapshot, actor }: { snapshot: IssuesSnapshot; actor: IssuesActor }) {
  const { context } = snapshot;
  const { send } = actor;
  let body;
  if (snapshot.matches({ detail: { selected: { labels: "loading" } } })) {
    body = <p className="muted">loading labels</p>;
  } else if (snapshot.matches({ detail: { selected: { labels: "failed" } } })) {
    body = <p className="error">labels error: {context.labelsError}</p>;
  } else {
    const labels = visibleLabels(context);
    body =
      labels.length === 0 ? (
        <p className="muted">no labels</p>
      ) : (
        <ul className="chips">
          {labels.map(label => (
            <li key={label}>
              <span data-testid="label">{label}</span>
              <button type="button" data-testid="remove-label" onClick={() => send({ type: "label.remove", label })}>
                remove {label}
              </button>
            </li>
          ))}
        </ul>
      );
  }
  return (
    <div className="section">
      <h3>Labels</h3>
      <div data-testid="labels">{body}</div>
      <form
        className="form-row"
        onSubmit={e => {
          e.preventDefault();
          send({ type: "label.add" });
        }}
      >
        <input
          data-testid="label-input"
          aria-label="label"
          placeholder="add a label"
          value={context.labelDraft}
          onChange={e => send({ type: "label.change", value: e.target.value })}
        />
        <button type="submit" data-testid="add-label">
          add label
        </button>
      </form>
      {context.errors.label !== null && (
        <p className="error" data-testid="label-error">label error: {context.errors.label}</p>
      )}
    </div>
  );
}

function Related({ snapshot, actor }: { snapshot: IssuesSnapshot; actor: IssuesActor }) {
  const { context } = snapshot;
  const { send } = actor;
  let body;
  if (snapshot.matches({ detail: { selected: { related: "failed" } } })) {
    body = <p className="error">related help failed: {context.relatedError}</p>;
  } else if (snapshot.matches({ detail: { selected: { related: "ready" } } })) {
    const hits = context.related.slice(0, 3);
    body =
      hits.length === 0 ? (
        <p className="muted">no related help</p>
      ) : (
        <div className="form-row">
          {hits.map(hit => (
            <button
              key={hit.id}
              type="button"
              data-testid="related-hit"
              onClick={() => send({ type: "related.open", hitId: hit.id })}
            >
              {hit.name}
            </button>
          ))}
        </div>
      );
  } else {
    body = <p className="muted">finding related help</p>;
  }
  return (
    <div className="section" data-testid="related">
      <h3>Related help</h3>
      {body}
    </div>
  );
}
