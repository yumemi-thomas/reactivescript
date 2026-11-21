import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { issuesMachine, visibleIssues, visibleLabels, visibleTitle } from "./issuesMachine";

type IssuesActor = ActorRefFrom<typeof issuesMachine>;

export function IssuesPage({ actor }: { actor: IssuesActor }) {
  const state = useSelector(actor, s => s);
  const ctx = state.context;
  const send = actor.send;
  const rows = visibleIssues(ctx);
  const listLoaded = state.matches({ list: "loaded" });
  const showOpen = ctx.listFilter === "open";

  return (
    <section className="issues">
      <div className="toolbar">
        <label>
          Current user{" "}
          <input data-testid="user" value={ctx.user} onChange={e => send({ type: "USER", value: e.target.value })} />
        </label>
        <div className="filters">
          <button type="button" data-testid="filter-open" aria-pressed={ctx.filter === "open"} onClick={() => send({ type: "FILTER", filter: "open" })}>
            open
          </button>
          <button type="button" data-testid="filter-closed" aria-pressed={ctx.filter === "closed"} onClick={() => send({ type: "FILTER", filter: "closed" })}>
            closed
          </button>
        </div>
      </div>

      {ctx.rowError !== null && <p className="error" data-testid="row-error">row error: {ctx.rowError}</p>}

      <div className="columns">
        <div data-testid="list" className="list">
          {state.matches({ list: "loading" }) && <p>loading {ctx.filter} issues</p>}
          {state.matches({ list: "failed" }) && <p className="error">list error: {ctx.listError}</p>}
          {listLoaded && (
            <ul>
              {rows.map(issue => (
                <li key={issue.id} className={issue.id === ctx.selectedId ? "selected" : undefined}>
                  <button type="button" className="row" data-testid="issue" onClick={() => send({ type: "SELECT", id: issue.id })}>
                    #{issue.id} {issue.title} ({issue.assignee ?? "unassigned"})
                  </button>
                  <button type="button" data-testid="row-assign" onClick={() => send({ type: "ROW_ASSIGN", id: issue.id })}>
                    assign to {ctx.user}
                  </button>
                  {showOpen && (
                    <button type="button" data-testid="row-close" onClick={() => send({ type: "ROW_CLOSE", id: issue.id })}>
                      close
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div data-testid="detail" className="detail">
          {ctx.selectedId === null ? <p>select an issue</p> : <Detail actor={actor} />}
        </div>
      </div>
    </section>
  );
}

function Detail({ actor }: { actor: IssuesActor }) {
  const state = useSelector(actor, s => s);
  const ctx = state.context;
  const send = actor.send;
  const id = ctx.selectedId;
  const issueLoaded = state.matches({ detail: { selected: { issue: "loaded" } } });
  const title = visibleTitle(ctx);
  const labels = visibleLabels(ctx);

  return (
    <>
      <div className="heading">
        {state.matches({ detail: { selected: { issue: "loading" } } }) && <p>loading #{id}</p>}
        {state.matches({ detail: { selected: { issue: "notFound" } } }) && <p className="error">detail error: issue #{id} not found</p>}
        {state.matches({ detail: { selected: { issue: "failed" } } }) && <p className="error">detail error: {ctx.detailError}</p>}
        {issueLoaded && ctx.detail && (
          <>
            <h2>
              #{ctx.detail.id} {title}
            </h2>
            <p className="body">{ctx.detail.body}</p>
          </>
        )}
        <button type="button" data-testid="retry" onClick={() => send({ type: "RETRY" })}>
          retry
        </button>
      </div>

      <div className="actions">
        <button type="button" data-testid="assign" onClick={() => send({ type: "ASSIGN" })}>
          assign to {ctx.user}
        </button>
        {ctx.errors.assign !== null && <p className="error" data-testid="assign-error">{ctx.errors.assign}</p>}

        <div className="field">
          <input
            data-testid="title-input"
            aria-label="New title"
            value={ctx.titleInput}
            onChange={e => send({ type: "TITLE_INPUT", value: e.target.value })}
          />
          <button type="button" data-testid="rename" onClick={() => send({ type: "RENAME" })}>
            rename
          </button>
        </div>
        {ctx.errors.rename !== null && <p className="error" data-testid="rename-error">rename error: {ctx.errors.rename}</p>}

        <button type="button" data-testid="close" onClick={() => send({ type: "CLOSE" })}>
          close
        </button>
        {ctx.errors.close !== null && <p className="error" data-testid="close-error">close error: {ctx.errors.close}</p>}
      </div>

      <div data-testid="comments" className="comments">
        {state.matches({ detail: { selected: { comments: "loading" } } }) && <p>loading comments</p>}
        {state.matches({ detail: { selected: { comments: "failed" } } }) && <p className="error">comments error: {ctx.commentsError}</p>}
        {state.matches({ detail: { selected: { comments: "loaded" } } }) && (
          <ul>
            {ctx.comments.map((c, i) => (
              <li key={`c${i}`} data-testid="comment">
                {c.author}: {c.text}
              </li>
            ))}
            {ctx.pendingPosts.map(p => (
              <li key={`p${p.opId}`} data-testid="comment" className="pending">
                {p.author}: {p.text} (sending…)
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="field">
        <input
          data-testid="comment-input"
          aria-label="Comment"
          value={ctx.commentInput}
          onChange={e => send({ type: "COMMENT_INPUT", value: e.target.value })}
        />
        <button type="button" data-testid="post" onClick={() => send({ type: "POST" })}>
          post
        </button>
      </div>
      {ctx.errors.post !== null && <p className="error" data-testid="post-error">post error: {ctx.errors.post}</p>}

      <div data-testid="labels" className="labels">
        {state.matches({ detail: { selected: { labels: "loading" } } }) && <p>loading labels</p>}
        {state.matches({ detail: { selected: { labels: "failed" } } }) && <p className="error">labels error: {ctx.labelsError}</p>}
        {state.matches({ detail: { selected: { labels: "loaded" } } }) && (
          <ul>
            {labels.map(label => (
              <li key={label}>
                <span data-testid="label">{label}</span>{" "}
                <button type="button" data-testid="remove-label" onClick={() => send({ type: "REMOVE_LABEL", label })}>
                  remove {label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="field">
        <input
          data-testid="label-input"
          aria-label="Label"
          value={ctx.labelInput}
          onChange={e => send({ type: "LABEL_INPUT", value: e.target.value })}
        />
        <button type="button" data-testid="add-label" onClick={() => send({ type: "ADD_LABEL" })}>
          add label
        </button>
      </div>
      {ctx.errors.label !== null && <p className="error" data-testid="label-error">label error: {ctx.errors.label}</p>}

      {issueLoaded && (
        <div data-testid="related" className="related">
          {state.matches({ detail: { selected: { issue: { loaded: "searching" } } } }) && <p>finding related help</p>}
          {state.matches({ detail: { selected: { issue: { loaded: "failed" } } } }) && <p className="error">related help failed: {ctx.relatedError}</p>}
          {state.matches({ detail: { selected: { issue: { loaded: "found" } } } }) &&
            (ctx.related.length === 0 ? (
              <p>no related help</p>
            ) : (
              <ul>
                {ctx.related.slice(0, 3).map(hit => (
                  <li key={hit.id}>
                    <button type="button" data-testid="related-hit" onClick={() => send({ type: "OPEN_RELATED", hitId: hit.id })}>
                      {hit.name}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </>
  );
}
