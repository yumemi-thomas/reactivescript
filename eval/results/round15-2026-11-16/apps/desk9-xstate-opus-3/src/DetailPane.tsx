import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { detailMachine, shownLabels } from "./detailMachine";
import type { IssuesActor } from "./IssuesPage";
import { shownTitle } from "./issuesMachine";

const MAX_RELATED = 3;

export function DetailPane({
  issuesActor,
  detailActor,
}: {
  issuesActor: IssuesActor;
  detailActor: ActorRefFrom<typeof detailMachine>;
}) {
  const issues = useSelector(issuesActor, s => s.context);
  const snapshot = useSelector(detailActor, s => s);
  const d = snapshot.context;
  const send = detailActor.send;
  const sendIssues = issuesActor.send;
  const labels = shownLabels(d.labels, d.labelOps);
  const userBlank = issues.user.trim() === "";

  return (
    <article>
      <div className="detail-main">
        {snapshot.matches({ issue: "loading" }) && <p>{`loading #${d.id}`}</p>}
        {snapshot.matches({ issue: "notFound" }) && <p className="error">{`detail error: issue #${d.id} not found`}</p>}
        {snapshot.matches({ issue: "failed" }) && <p className="error">{`detail error: ${d.issueError}`}</p>}
        {snapshot.matches({ issue: "loaded" }) && d.issue && (
          <>
            <h2>{`#${d.id} ${shownTitle(issues, d.id, d.issue.title)}`}</h2>
            <p className="body">{d.issue.body}</p>
          </>
        )}
        <button type="button" data-testid="retry" onClick={() => send({ type: "retry" })}>
          retry
        </button>
      </div>

      <div className="actions">
        <button
          type="button"
          data-testid="assign"
          disabled={userBlank}
          onClick={() => sendIssues({ type: "detail.assign" })}
        >
          {`assign to ${issues.user}`}
        </button>
        {issues.assignError !== null && (
          <p className="error" role="alert">
            {issues.assignError}
          </p>
        )}

        <div className="field">
          <input
            data-testid="title-input"
            aria-label="New title"
            value={issues.titleDraft}
            onChange={e => sendIssues({ type: "title.change", value: e.target.value })}
          />
          <button type="button" data-testid="rename" onClick={() => sendIssues({ type: "detail.rename" })}>
            rename
          </button>
        </div>
        {issues.renameError !== null && (
          <p className="error" role="alert">{`rename error: ${issues.renameError}`}</p>
        )}

        <button type="button" data-testid="close" onClick={() => sendIssues({ type: "detail.close" })}>
          close
        </button>
        {issues.closeError !== null && (
          <p className="error" role="alert">{`close error: ${issues.closeError}`}</p>
        )}
      </div>

      {snapshot.matches({ issue: "loaded" }) && (
        <div data-testid="related" className="related">
          {snapshot.matches({ issue: { loaded: "searching" } }) && <p>finding related help</p>}
          {snapshot.matches({ issue: { loaded: "failed" } }) && (
            <p className="error">{`related help failed: ${d.relatedError}`}</p>
          )}
          {snapshot.matches({ issue: { loaded: "found" } }) &&
            (d.related.length === 0 ? (
              <p>no related help</p>
            ) : (
              <ul>
                {d.related.slice(0, MAX_RELATED).map(hit => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      data-testid="related-hit"
                      onClick={() => sendIssues({ type: "related.open", query: d.relatedQuery, hitId: hit.id })}
                    >
                      {hit.name}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}

      <div data-testid="labels" className="labels">
        {snapshot.matches({ labels: "loading" }) && <p>loading labels</p>}
        {snapshot.matches({ labels: "failed" }) && <p className="error">{`labels error: ${d.labelsError}`}</p>}
        {snapshot.matches({ labels: "loaded" }) && (
          <ul>
            {labels.map(label => (
              <li key={label}>
                <span data-testid="label" className="label">
                  {label}
                </span>
                <button
                  type="button"
                  data-testid="remove-label"
                  onClick={() => send({ type: "label.remove", label })}
                >
                  {`remove ${label}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="field">
        <input
          data-testid="label-input"
          aria-label="New label"
          value={d.labelDraft}
          onChange={e => send({ type: "label.change", value: e.target.value })}
        />
        <button type="button" data-testid="add-label" onClick={() => send({ type: "label.add" })}>
          add label
        </button>
      </div>
      {d.labelError !== null && <p className="error" role="alert">{`label error: ${d.labelError}`}</p>}

      <div data-testid="comments" className="comments">
        {snapshot.matches({ comments: "loading" }) && <p>loading comments</p>}
        {snapshot.matches({ comments: "failed" }) && <p className="error">{`comments error: ${d.commentsError}`}</p>}
        {(snapshot.matches({ comments: "loaded" }) || d.pendingPosts.length > 0) && (
          <ul>
            {snapshot.matches({ comments: "loaded" }) &&
              d.comments.map((c, i) => (
                <li key={`c${i}`} data-testid="comment">
                  {`${c.author}: ${c.text}`}
                </li>
              ))}
            {d.pendingPosts.map(p => (
              <li key={`p${p.seq}`} data-testid="comment" className="pending">
                {`${p.author}: ${p.text} (sending…)`}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="field">
        <input
          data-testid="comment-input"
          aria-label="New comment"
          value={d.commentDraft}
          onChange={e => send({ type: "comment.change", value: e.target.value })}
        />
        <button
          type="button"
          data-testid="post"
          onClick={() => send({ type: "comment.post", author: issues.user })}
        >
          post
        </button>
      </div>
      {d.postError !== null && <p className="error" role="alert">{`post error: ${d.postError}`}</p>}
    </article>
  );
}
