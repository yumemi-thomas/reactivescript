import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import {
  issuesMachine,
  visibleComments,
  visibleIssues,
  visibleLabels,
  visibleTitle,
  type IssuesContext,
} from "./issuesMachine";
import type { Issue } from "./api";

type IssuesActor = ActorRefFrom<typeof issuesMachine>;
type IssuesSnapshot = ReturnType<IssuesActor["getSnapshot"]>;

const rowText = (i: Issue) => `#${i.id} ${i.title} (${i.assignee ?? "unassigned"})`;

export function IssuesPage({ actor }: { actor: IssuesActor }) {
  const snapshot = useSelector(actor, s => s);
  const c = snapshot.context;
  const send = actor.send;

  return (
    <section className="page issues-page" aria-label="Issues">
      <div className="toolbar">
        <label className="field">
          <span>Current user</span>
          <input
            data-testid="user"
            value={c.user}
            onChange={e => send({ type: "user.change", value: e.target.value })}
            autoComplete="off"
          />
        </label>
        <div className="segmented" role="group" aria-label="Filter">
          <button
            data-testid="filter-open"
            aria-pressed={c.filter === "open"}
            onClick={() => send({ type: "filter.set", filter: "open" })}
          >
            Open
          </button>
          <button
            data-testid="filter-closed"
            aria-pressed={c.filter === "closed"}
            onClick={() => send({ type: "filter.set", filter: "closed" })}
          >
            Closed
          </button>
        </div>
      </div>

      {c.rowError !== null && (
        <p className="error" data-testid="row-error" role="alert">
          row error: {c.rowError}
        </p>
      )}

      <div className="columns">
        <IssueList snapshot={snapshot} send={send} />
        <IssueDetailPane snapshot={snapshot} send={send} />
      </div>
    </section>
  );
}

type PaneProps = { snapshot: IssuesSnapshot; send: IssuesActor["send"] };

function IssueList({ snapshot, send }: PaneProps) {
  const c = snapshot.context;
  const canAssign = c.user.trim() !== "";
  let body;
  if (snapshot.matches({ list: "loading" })) {
    body = <p className="muted">loading {c.filter} issues</p>;
  } else if (snapshot.matches({ list: "failed" })) {
    body = <p className="error">list error: {c.listError}</p>;
  } else {
    const issues = visibleIssues(c);
    body =
      issues.length === 0 ? (
        <p className="muted">no {c.filter} issues</p>
      ) : (
        <ul className="rows">
          {issues.map(issue => (
            <li key={issue.id} className={issue.id === c.selectedId ? "row selected" : "row"}>
              <button
                className="row-main"
                data-testid="issue"
                aria-current={issue.id === c.selectedId}
                onClick={() => send({ type: "issue.select", id: issue.id })}
              >
                {rowText(issue)}
              </button>
              <button
                data-testid="row-assign"
                disabled={!canAssign}
                onClick={() => send({ type: "row.assign", id: issue.id })}
              >
                assign to {c.user}
              </button>
              {c.filter === "open" && (
                <button data-testid="row-close" onClick={() => send({ type: "row.close", id: issue.id })}>
                  close
                </button>
              )}
            </li>
          ))}
        </ul>
      );
  }
  return (
    <div className="pane list-pane" data-testid="list" aria-live="polite">
      {body}
    </div>
  );
}

function IssueDetailPane({ snapshot, send }: PaneProps) {
  const c = snapshot.context;
  const id = c.selectedId;
  if (id === null) {
    return (
      <div className="pane detail-pane" data-testid="detail">
        <p className="muted">select an issue</p>
      </div>
    );
  }

  const info = (s: "loading" | "loaded" | "notFound" | "failed") =>
    snapshot.matches({ detail: { selected: { info: s } } });

  let head;
  if (info("loading")) head = <p className="muted">loading #{id}</p>;
  else if (info("notFound")) head = <p className="error">detail error: issue #{id} not found</p>;
  else if (info("failed")) head = <p className="error">detail error: {c.detailError}</p>;
  else
    head = (
      <>
        <h2>
          #{id} {visibleTitle(c)}
        </h2>
        <p className="body">{c.detail?.body}</p>
      </>
    );

  return (
    <div className="pane detail-pane" data-testid="detail" aria-live="polite">
      {head}
      <div className="actions">
        <button data-testid="retry" onClick={() => send({ type: "detail.retry" })}>
          retry
        </button>
        <button data-testid="assign" disabled={c.user.trim() === ""} onClick={() => send({ type: "assign" })}>
          assign to {c.user}
        </button>
        <button data-testid="close" onClick={() => send({ type: "close" })}>
          close
        </button>
      </div>
      {c.assignError !== null && (
        <p className="error" data-testid="assign-error">
          {c.assignError}
        </p>
      )}
      {c.closeError !== null && (
        <p className="error" data-testid="close-error">
          close error: {c.closeError}
        </p>
      )}

      <form
        className="inline-form"
        onSubmit={e => {
          e.preventDefault();
          send({ type: "rename" });
        }}
      >
        <input
          data-testid="title-input"
          aria-label="New title"
          placeholder="New title"
          value={c.titleInput}
          onChange={e => send({ type: "title.change", value: e.target.value })}
        />
        <button data-testid="rename" type="submit">
          rename
        </button>
      </form>
      {c.renameError !== null && (
        <p className="error" data-testid="rename-error">
          rename error: {c.renameError}
        </p>
      )}

      {info("loaded") && <RelatedHelp snapshot={snapshot} send={send} />}

      <Labels snapshot={snapshot} send={send} />
      <Comments snapshot={snapshot} send={send} />
    </div>
  );
}

function RelatedHelp({ snapshot, send }: PaneProps) {
  const c: IssuesContext = snapshot.context;
  const related = (s: "searching" | "ready" | "failed") =>
    snapshot.matches({ detail: { selected: { info: { loaded: s } } } });
  let body;
  if (related("searching")) body = <p className="muted">finding related help</p>;
  else if (related("failed")) body = <p className="error">related help failed: {c.relatedError}</p>;
  else if (c.related.length === 0) body = <p className="muted">no related help</p>;
  else
    body = (
      <ul className="chips">
        {c.related.slice(0, 3).map(hit => (
          <li key={hit.id}>
            <button data-testid="related-hit" onClick={() => send({ type: "related.pick", hitId: hit.id })}>
              {hit.name}
            </button>
          </li>
        ))}
      </ul>
    );
  return (
    <div className="section" data-testid="related">
      <h3>Related help</h3>
      {body}
    </div>
  );
}

function Labels({ snapshot, send }: PaneProps) {
  const c = snapshot.context;
  const labels = (s: "loading" | "ready" | "failed") => snapshot.matches({ detail: { selected: { labels: s } } });
  let body;
  if (labels("loading")) body = <p className="muted">loading labels</p>;
  else if (labels("failed")) body = <p className="error">labels error: {c.labelsError}</p>;
  else
    body = (
      <ul className="chips">
        {visibleLabels(c).map(label => (
          <li key={label} className="chip">
            <span data-testid="label">{label}</span>
            <button data-testid="remove-label" onClick={() => send({ type: "label.remove", label })}>
              remove {label}
            </button>
          </li>
        ))}
      </ul>
    );
  return (
    <div className="section">
      <h3>Labels</h3>
      <div data-testid="labels">{body}</div>
      <form
        className="inline-form"
        onSubmit={e => {
          e.preventDefault();
          send({ type: "label.add" });
        }}
      >
        <input
          data-testid="label-input"
          aria-label="New label"
          placeholder="New label"
          value={c.labelInput}
          onChange={e => send({ type: "labelInput.change", value: e.target.value })}
        />
        <button data-testid="add-label" type="submit">
          add label
        </button>
      </form>
      {c.labelError !== null && (
        <p className="error" data-testid="label-error">
          label error: {c.labelError}
        </p>
      )}
    </div>
  );
}

function Comments({ snapshot, send }: PaneProps) {
  const c = snapshot.context;
  const comments = (s: "loading" | "ready" | "failed") => snapshot.matches({ detail: { selected: { comments: s } } });
  const rows = visibleComments(c);
  return (
    <div className="section">
      <h3>Comments</h3>
      <div data-testid="comments">
        {comments("loading") && <p className="muted">loading comments</p>}
        {comments("failed") && <p className="error">comments error: {c.commentsError}</p>}
        {(comments("ready") || rows.some(r => r.sending)) && (
          <ul className="comments">
            {rows
              .filter(r => comments("ready") || r.sending)
              .map(r => (
                <li key={r.key} data-testid="comment" className={r.sending ? "sending" : undefined}>
                  {r.author}: {r.text}
                  {r.sending ? " (sending…)" : ""}
                </li>
              ))}
          </ul>
        )}
      </div>
      <form
        className="inline-form"
        onSubmit={e => {
          e.preventDefault();
          send({ type: "post" });
        }}
      >
        <input
          data-testid="comment-input"
          aria-label="Comment"
          placeholder="Write a comment"
          value={c.commentInput}
          onChange={e => send({ type: "comment.change", value: e.target.value })}
        />
        <button data-testid="post" type="submit">
          post
        </button>
      </form>
      {c.postError !== null && (
        <p className="error" data-testid="post-error">
          post error: {c.postError}
        </p>
      )}
    </div>
  );
}
