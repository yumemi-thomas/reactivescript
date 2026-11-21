import { useSelector } from "@xstate/react";
import type { ActorRefFrom, SnapshotFrom } from "xstate";
import { issuesMachine, visibleIssues, visibleLabels, visibleTitle } from "../machines/issuesMachine";

type IssuesActor = ActorRefFrom<typeof issuesMachine>;
type IssuesSnapshot = SnapshotFrom<typeof issuesMachine>;

const identity = (s: IssuesSnapshot) => s;

export function IssuesPage({ actor }: { actor: IssuesActor }) {
  const snapshot = useSelector(actor, identity);
  const { context: ctx } = snapshot;
  const send = actor.send;
  const rows = visibleIssues(ctx);
  const showRowClose = ctx.listFilter === "open";

  return (
    <div className="issues">
      <section aria-label="Issues">
        <div className="toolbar">
          <label>
            Current user{" "}
            <input data-testid="user" value={ctx.user} onChange={(e) => send({ type: "user.change", value: e.target.value })} />
          </label>
        </div>
        <div className="toolbar" role="group" aria-label="Filter">
          <button
            type="button"
            data-testid="filter-open"
            aria-pressed={ctx.filter === "open"}
            className={ctx.filter === "open" ? "pressed" : undefined}
            onClick={() => send({ type: "filter.set", filter: "open" })}
          >
            open
          </button>
          <button
            type="button"
            data-testid="filter-closed"
            aria-pressed={ctx.filter === "closed"}
            className={ctx.filter === "closed" ? "pressed" : undefined}
            onClick={() => send({ type: "filter.set", filter: "closed" })}
          >
            closed
          </button>
        </div>
        {ctx.rowError !== null && (
          <p className="error" role="alert" data-testid="row-error">
            {ctx.rowError}
          </p>
        )}
        <div data-testid="list" aria-busy={snapshot.matches({ list: "loading" })}>
          {snapshot.matches({ list: "loading" }) && <p className="muted">{`loading ${ctx.filter} issues`}</p>}
          {snapshot.matches({ list: "failed" }) && <p className="error">{`list error: ${ctx.listError}`}</p>}
          {snapshot.matches({ list: "ready" }) && (
            <ul className="rows">
              {rows.map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    data-testid="issue"
                    className={issue.id === ctx.selectedId ? "issue selected" : "issue"}
                    aria-current={issue.id === ctx.selectedId ? "true" : undefined}
                    onClick={() => send({ type: "select", id: issue.id })}
                  >
                    {`#${issue.id} ${issue.title} (${issue.assignee ?? "unassigned"})`}
                  </button>
                  <button type="button" data-testid="row-assign" onClick={() => send({ type: "row.assign", id: issue.id })}>
                    {`assign to ${ctx.user}`}
                  </button>
                  {showRowClose && (
                    <button type="button" data-testid="row-close" onClick={() => send({ type: "row.close", id: issue.id })}>
                      close
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <Detail snapshot={snapshot} send={send} />
    </div>
  );
}

function Detail({ snapshot, send }: { snapshot: IssuesSnapshot; send: IssuesActor["send"] }) {
  const ctx = snapshot.context;
  const id = ctx.selectedId;
  if (id === null || !snapshot.matches({ detail: "selected" })) {
    return (
      <section className="panel" data-testid="detail" aria-label="Detail">
        <p className="muted">select an issue</p>
      </section>
    );
  }
  const issueState = (s: "loading" | "ready" | "notFound" | "failed") => snapshot.matches({ detail: { selected: { issue: s } } });
  const commentsState = (s: "loading" | "ready" | "failed") => snapshot.matches({ detail: { selected: { comments: s } } });
  const labelsState = (s: "loading" | "ready" | "failed") => snapshot.matches({ detail: { selected: { labels: s } } });
  const relatedState = (s: "searching" | "found" | "failed") =>
    snapshot.matches({ detail: { selected: { issue: { ready: s } } } });
  const labels = visibleLabels(ctx);

  return (
    <section className="panel" data-testid="detail" aria-label="Detail">
      {issueState("loading") && <p className="muted">{`loading #${id}`}</p>}
      {issueState("notFound") && <p className="error">{`detail error: issue #${id} not found`}</p>}
      {issueState("failed") && <p className="error">{`detail error: ${ctx.detailError}`}</p>}
      {issueState("ready") && ctx.detail && (
        <>
          <h2>{`#${ctx.detail.id} ${visibleTitle(ctx)}`}</h2>
          <p>{ctx.detail.body}</p>
        </>
      )}
      <div className="field">
        <button type="button" data-testid="retry" onClick={() => send({ type: "retry" })}>
          retry
        </button>
        <button type="button" data-testid="assign" onClick={() => send({ type: "assign" })}>
          {`assign to ${ctx.user}`}
        </button>
        <button type="button" data-testid="close" onClick={() => send({ type: "close" })}>
          close
        </button>
      </div>
      {ctx.assignError !== null && <p className="error" role="alert">{ctx.assignError}</p>}
      {ctx.closeError !== null && <p className="error" role="alert">{ctx.closeError}</p>}
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "rename" });
        }}
      >
        <input
          data-testid="title-input"
          aria-label="New title"
          placeholder="new title"
          value={ctx.titleInput}
          onChange={(e) => send({ type: "title.change", value: e.target.value })}
        />
        <button type="submit" data-testid="rename">
          rename
        </button>
      </form>
      {ctx.renameError !== null && <p className="error" role="alert">{ctx.renameError}</p>}

      {issueState("ready") && (
        <div className="section" data-testid="related">
          <h3>Related help</h3>
          {relatedState("searching") && <p className="muted">finding related help</p>}
          {relatedState("failed") && <p className="error">{`related help failed: ${ctx.relatedError}`}</p>}
          {relatedState("found") &&
            (ctx.related.length === 0 ? (
              <p className="muted">no related help</p>
            ) : (
              <ul className="rows">
                {ctx.related.slice(0, 3).map((hit) => (
                  <li key={hit.id}>
                    <button type="button" data-testid="related-hit" onClick={() => send({ type: "related.open", hitId: hit.id })}>
                      {hit.name}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}

      <div className="section" data-testid="labels">
        <h3>Labels</h3>
        {labelsState("loading") && <p className="muted">loading labels</p>}
        {labelsState("failed") && <p className="error">{`labels error: ${ctx.labelsError}`}</p>}
        {labelsState("ready") && (
          <div>
            {labels.map((label) => (
              <span key={label} className="label-chip">
                <span data-testid="label">{label}</span>
                <button type="button" data-testid="remove-label" onClick={() => send({ type: "label.remove", label })}>
                  {`remove ${label}`}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "label.add" });
        }}
      >
        <input
          data-testid="label-input"
          aria-label="New label"
          placeholder="label"
          value={ctx.labelInput}
          onChange={(e) => send({ type: "label.change", value: e.target.value })}
        />
        <button type="submit" data-testid="add-label">
          add label
        </button>
      </form>
      {ctx.labelError !== null && <p className="error" role="alert">{ctx.labelError}</p>}

      <div className="section" data-testid="comments">
        <h3>Comments</h3>
        {commentsState("loading") && <p className="muted">loading comments</p>}
        {commentsState("failed") && <p className="error">{`comments error: ${ctx.commentsError}`}</p>}
        {commentsState("ready") && (
          <ul className="rows">
            {ctx.comments.map((c, i) => (
              <li key={`c${i}`} data-testid="comment">{`${c.author}: ${c.text}`}</li>
            ))}
            {ctx.posts.map((p) => (
              <li key={p.opId} data-testid="comment">
                {p.status === "sending" ? `${p.author}: ${p.text} (sending…)` : `${p.author}: ${p.text}`}
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "post" });
        }}
      >
        <input
          data-testid="comment-input"
          aria-label="Comment"
          placeholder="comment"
          value={ctx.commentInput}
          onChange={(e) => send({ type: "comment.change", value: e.target.value })}
        />
        <button type="submit" data-testid="post">
          post
        </button>
      </form>
      {ctx.postError !== null && <p className="error" role="alert">{ctx.postError}</p>}
    </section>
  );
}
