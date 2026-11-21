import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { appMachine } from "../machines/app";
import type { issueDetailMachine } from "../machines/issueDetail";
import { viewLabels, viewTitle } from "../model";

type Props = {
  appRef: ActorRefFrom<typeof appMachine>;
  detailRef: ActorRefFrom<typeof issueDetailMachine>;
  user: string;
};

const RELATED_MAX = 3;

export function DetailPane({ appRef, detailRef, user }: Props) {
  const ctx = useSelector(detailRef, (s) => s.context);
  const issueState = useSelector(detailRef, (s) =>
    s.matches({ issue: "loaded" })
      ? "loaded"
      : s.matches({ issue: "notFound" })
        ? "notFound"
        : s.matches({ issue: "failed" })
          ? "failed"
          : "loading",
  );
  const commentsState = useSelector(detailRef, (s) =>
    s.matches({ comments: "ready" }) ? "ready" : s.matches({ comments: "failed" }) ? "failed" : "loading",
  );
  const labelsState = useSelector(detailRef, (s) =>
    s.matches({ labels: "ready" }) ? "ready" : s.matches({ labels: "failed" }) ? "failed" : "loading",
  );
  const relatedState = useSelector(detailRef, (s) =>
    s.matches({ related: "done" })
      ? "done"
      : s.matches({ related: "failed" })
        ? "failed"
        : s.matches({ related: "searching" })
          ? "searching"
          : "idle",
  );
  const confirmed = useSelector(appRef, (s) => s.context.confirmed);
  const pending = useSelector(appRef, (s) => s.context.pending);
  const errors = useSelector(appRef, (s) => s.context.detailErrors);

  const { id, issue } = ctx;
  const title = issue ? viewTitle(id, issue.title, ctx.issueAt, confirmed, pending) : "";
  const labels = viewLabels(ctx.labels, ctx.labelOps);
  const author = user.trim();
  const newTitle = ctx.titleInput.trim();

  return (
    <article className="detail-body">
      <header className="detail-head">
        {issueState === "loading" && <p className="muted">loading #{id}</p>}
        {issueState === "loaded" && issue && (
          <>
            <h2>
              #{id} {title}
            </h2>
            <p className="body">{issue.body}</p>
          </>
        )}
        {issueState === "notFound" && (
          <p className="error" role="alert">
            detail error: issue #{id} not found
          </p>
        )}
        {issueState === "failed" && (
          <p className="error" role="alert">
            detail error: {ctx.issueError}
          </p>
        )}
        <button type="button" data-testid="retry" onClick={() => detailRef.send({ type: "retry" })}>
          retry
        </button>
      </header>

      <section className="actions" aria-label="Issue actions">
        <div className="action-row">
          <button
            type="button"
            data-testid="assign"
            disabled={author === ""}
            onClick={() =>
              appRef.send({ type: "change.start", source: "detail", change: { kind: "assign", id, assignee: author } })
            }
          >
            assign to {user}
          </button>
          <button
            type="button"
            data-testid="close"
            onClick={() => appRef.send({ type: "change.start", source: "detail", change: { kind: "close", id } })}
          >
            close
          </button>
        </div>
        <form
          className="action-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (newTitle !== "")
              appRef.send({ type: "change.start", source: "detail", change: { kind: "rename", id, title: newTitle } });
          }}
        >
          <input
            data-testid="title-input"
            aria-label="New title"
            placeholder="New title"
            value={ctx.titleInput}
            onChange={(e) => detailRef.send({ type: "title.change", value: e.target.value })}
          />
          <button type="submit" data-testid="rename">
            rename
          </button>
        </form>
        {errors.assign !== null && (
          <p className="error" role="alert">
            assign error: {errors.assign}
          </p>
        )}
        {errors.rename !== null && (
          <p className="error" role="alert">
            rename error: {errors.rename}
          </p>
        )}
        {errors.close !== null && (
          <p className="error" role="alert">
            close error: {errors.close}
          </p>
        )}
      </section>

      <section className="labels-section" aria-label="Labels">
        <h3>Labels</h3>
        <div data-testid="labels">
          {labelsState === "loading" && <p className="muted">loading labels</p>}
          {labelsState === "failed" && <p className="error">labels error: {ctx.labelsError}</p>}
          {labelsState === "ready" && (
            <ul className="chips">
              {labels.map((label) => (
                <li key={label} className="chip">
                  <span data-testid="label">{label}</span>
                  <button
                    type="button"
                    data-testid="remove-label"
                    aria-label={`remove ${label}`}
                    onClick={() => detailRef.send({ type: "label.remove", label })}
                  >
                    remove {label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form
          className="action-row"
          onSubmit={(e) => {
            e.preventDefault();
            detailRef.send({ type: "label.add" });
          }}
        >
          <input
            data-testid="label-input"
            aria-label="New label"
            placeholder="New label"
            value={ctx.labelInput}
            onChange={(e) => detailRef.send({ type: "label.change", value: e.target.value })}
          />
          <button type="submit" data-testid="add-label">
            add label
          </button>
        </form>
        {ctx.labelError !== null && (
          <p className="error" role="alert">
            label error: {ctx.labelError}
          </p>
        )}
      </section>

      <section className="comments-section" aria-label="Comments">
        <h3>Comments</h3>
        <div data-testid="comments">
          {commentsState === "loading" && <p className="muted">loading comments</p>}
          {commentsState === "failed" && <p className="error">comments error: {ctx.commentsError}</p>}
          <ul className="comment-list">
            {commentsState === "ready" &&
              ctx.comments.map((c, i) => (
                <li key={`c${i}`} data-testid="comment">
                  {c.author}: {c.text}
                </li>
              ))}
            {ctx.posts.map((p) => (
              <li key={`p${p.opId}`} data-testid="comment" className={p.sentAt === null ? "sending" : undefined}>
                {p.author}: {p.text}
                {p.sentAt === null ? " (sending…)" : ""}
              </li>
            ))}
          </ul>
        </div>
        <form
          className="action-row"
          onSubmit={(e) => {
            e.preventDefault();
            detailRef.send({ type: "post", author });
          }}
        >
          <input
            data-testid="comment-input"
            aria-label="Comment"
            placeholder="Write a comment"
            value={ctx.commentInput}
            onChange={(e) => detailRef.send({ type: "comment.change", value: e.target.value })}
          />
          <button type="submit" data-testid="post">
            post
          </button>
        </form>
        {ctx.postError !== null && (
          <p className="error" role="alert">
            post error: {ctx.postError}
          </p>
        )}
      </section>

      {issueState === "loaded" && issue && (
        <section className="related-section" aria-label="Related help">
          <h3>Related help</h3>
          <div data-testid="related">
            {relatedState === "searching" && <p className="muted">finding related help</p>}
            {relatedState === "failed" && <p className="error">related help failed: {ctx.relatedError}</p>}
            {relatedState === "done" &&
              (ctx.related.length === 0 ? (
                <p className="muted">no related help</p>
              ) : (
                <ul className="related-list">
                  {ctx.related.slice(0, RELATED_MAX).map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        data-testid="related-hit"
                        onClick={() =>
                          appRef.send({
                            type: "help.openRelated",
                            query: issue.title,
                            hits: ctx.related,
                            selectedId: hit.id,
                          })
                        }
                      >
                        {hit.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        </section>
      )}
    </article>
  );
}
