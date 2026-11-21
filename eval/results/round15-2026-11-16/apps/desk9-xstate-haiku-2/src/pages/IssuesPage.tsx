import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { issuesMachine, IssuesEvent } from "../machines/issues.js";

export type IssuesRef = ActorRefFrom<typeof issuesMachine>;

const RELATED_SHOWN = 3;

export function IssuesPage({ actor }: { actor: IssuesRef }) {
  const snap = useSelector(actor, (s) => s);
  const c = snap.context;
  const emit = (e: IssuesEvent) => actor.send(e);

  const listLoading = snap.matches({ list: "loading" });
  const listFailed = snap.matches({ list: "failed" });
  const rows = c.filter === "open" ? c.rows.filter((r) => r.hidden === "no") : c.rows;
  const selected = c.selectedId;
  const isSelected = selected !== null;

  const detailLoading = snap.matches({ selection: { selected: { detail: "loading" } } });
  const detailNotFound = snap.matches({ selection: { selected: { detail: "notFound" } } });
  const detailFailed = snap.matches({ selection: { selected: { detail: "failed" } } });
  const detailLoaded = snap.matches({ selection: { selected: { detail: "loaded" } } });
  const commentsLoading = snap.matches({ selection: { selected: { comments: "loading" } } });
  const commentsFailed = snap.matches({ selection: { selected: { comments: "failed" } } });
  const labelsLoading = snap.matches({ selection: { selected: { labels: "loading" } } });
  const labelsFailed = snap.matches({ selection: { selected: { labels: "failed" } } });
  const relatedWaiting = snap.matches({ selection: { selected: { related: "waiting" } } });
  const relatedSearching = snap.matches({ selection: { selected: { related: "searching" } } });
  const relatedFailed = snap.matches({ selection: { selected: { related: "failed" } } });

  return (
    <div className="issues-page">
      <div className="toolbar">
        <label>
          Current user{" "}
          <input data-testid="user" value={c.user} onChange={(e) => emit({ type: "user.set", value: e.target.value })} />
        </label>
        <div role="group" aria-label="Filter">
          <button
            data-testid="filter-open"
            aria-pressed={c.filter === "open"}
            onClick={() => emit({ type: "filter.set", filter: "open" })}
          >
            Open
          </button>
          <button
            data-testid="filter-closed"
            aria-pressed={c.filter === "closed"}
            onClick={() => emit({ type: "filter.set", filter: "closed" })}
          >
            Closed
          </button>
        </div>
      </div>

      <div className="columns">
        <section className="list-pane">
          <div data-testid="list">
            {listLoading ? (
              `loading ${c.filter} issues`
            ) : listFailed ? (
              `list error: ${c.errors.list ?? ""}`
            ) : (
              <ul>
                {rows.map((r) => (
                  <li key={r.id} className="row">
                    <button
                      data-testid="issue"
                      className="issue"
                      onClick={() => emit({ type: "select", id: r.id })}
                    >
                      {`#${r.id} ${r.title} (${r.assignee ?? "unassigned"})`}
                    </button>
                    <button data-testid="row-assign" onClick={() => emit({ type: "row.assign", id: r.id })}>
                      {`assign to ${c.user}`}
                    </button>
                    {c.filter === "open" && (
                      <button data-testid="row-close" onClick={() => emit({ type: "row.close", id: r.id })}>
                        close
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {c.errors.row && <p data-testid="row-error" role="alert">{c.errors.row}</p>}
        </section>

        <section className="detail-pane" data-testid="detail">
          {!isSelected ? (
            "select an issue"
          ) : (
            <>
              {detailLoading && `loading #${selected}`}
              {detailNotFound && `detail error: issue #${selected} not found`}
              {detailFailed && `detail error: ${c.errors.detail ?? ""}`}
              {detailLoaded && c.detail && (
                <article>
                  <h2>{`#${c.detail.id} ${c.detail.title}`}</h2>
                  <p>{c.detail.body}</p>
                </article>
              )}

              <div className="actions">
                <button data-testid="retry" onClick={() => emit({ type: "detail.retry" })}>
                  retry
                </button>
                <button data-testid="assign" onClick={() => emit({ type: "detail.assign" })}>
                  {`assign to ${c.user}`}
                </button>
                {c.errors.assign && <p role="alert">{c.errors.assign}</p>}
                <input
                  data-testid="title-input"
                  aria-label="New title"
                  value={c.titleDraft}
                  onChange={(e) => emit({ type: "title.set", value: e.target.value })}
                />
                <button data-testid="rename" onClick={() => emit({ type: "detail.rename" })}>
                  rename
                </button>
                {c.errors.rename && <p role="alert">{c.errors.rename}</p>}
                <button data-testid="close" onClick={() => emit({ type: "detail.close" })}>
                  close
                </button>
                {c.errors.close && <p role="alert">{c.errors.close}</p>}
              </div>

              <section data-testid="comments">
                {commentsLoading && "loading comments"}
                {commentsFailed && `comments error: ${c.errors.comments ?? ""}`}
                {!commentsLoading && !commentsFailed && (
                  <ul>
                    {c.comments.map((r, i) => (
                      <li key={r.tempId ?? `${i}-${r.author}-${r.text}`} data-testid="comment">
                        {`${r.author}: ${r.text}${r.tempId !== undefined ? " (sending…)" : ""}`}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <div className="actions">
                <input
                  data-testid="comment-input"
                  aria-label="Comment"
                  value={c.commentDraft}
                  onChange={(e) => emit({ type: "comment.set", value: e.target.value })}
                />
                <button data-testid="post" onClick={() => emit({ type: "detail.post" })}>
                  post
                </button>
                {c.errors.post && <p role="alert">{c.errors.post}</p>}
              </div>

              <section data-testid="labels">
                {labelsLoading && "loading labels"}
                {labelsFailed && `labels error: ${c.errors.labels ?? ""}`}
                {!labelsLoading && !labelsFailed && (
                  <ul>
                    {c.labels.map((l) => (
                      <li key={l}>
                        <span data-testid="label">{l}</span>
                        <button data-testid="remove-label" onClick={() => emit({ type: "detail.removeLabel", label: l })}>
                          {`remove ${l}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {c.errors.label && <p role="alert">{c.errors.label}</p>}
              </section>
              <div className="actions">
                <input
                  data-testid="label-input"
                  aria-label="Label"
                  value={c.labelDraft}
                  onChange={(e) => emit({ type: "label.set", value: e.target.value })}
                />
                <button data-testid="add-label" onClick={() => emit({ type: "detail.addLabel" })}>
                  add label
                </button>
              </div>

              {detailLoaded && (
                <section data-testid="related">
                  {(relatedWaiting || relatedSearching) && "finding related help"}
                  {relatedFailed && `related help failed: ${c.errors.related ?? ""}`}
                  {snap.matches({ selection: { selected: { related: "found" } } }) &&
                    (c.hits.length === 0 ? (
                      "no related help"
                    ) : (
                      <ul>
                        {c.hits.slice(0, RELATED_SHOWN).map((h) => (
                          <li key={h.id}>
                            <button data-testid="related-hit" onClick={() => emit({ type: "related.open", hit: h })}>
                              {h.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ))}
                </section>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
