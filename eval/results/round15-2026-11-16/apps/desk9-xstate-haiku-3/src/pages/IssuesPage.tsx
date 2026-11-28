import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { issuesMachine } from '../machines/issues.js';

export type IssuesActor = ActorRefFrom<typeof issuesMachine>;

export function IssuesPage({ actor }: { actor: IssuesActor }) {
  const snap = useSelector(actor, (s) => s);
  const c = snap.context;
  const selected = snap.matches({ detail: 'selected' });
  const id = c.selectedId;
  const rows = c.filter === 'open' ? c.openIssues : c.closedIssues;
  const listReady = snap.matches({ list: 'ready' });

  const issueLoading = snap.matches({ detail: { selected: { issue: 'loading' } } });
  const issueReady = snap.matches({ detail: { selected: { issue: 'ready' } } });
  const issueNotFound = snap.matches({ detail: { selected: { issue: 'notFound' } } });
  const issueFailed = snap.matches({ detail: { selected: { issue: 'failed' } } });
  const commentsLoading = snap.matches({ detail: { selected: { comments: 'loading' } } });
  const commentsReady = snap.matches({ detail: { selected: { comments: 'ready' } } });
  const commentsFailed = snap.matches({ detail: { selected: { comments: 'failed' } } });
  const labelsLoading = snap.matches({ detail: { selected: { labels: 'loading' } } });
  const labelsReady = snap.matches({ detail: { selected: { labels: 'ready' } } });
  const labelsFailed = snap.matches({ detail: { selected: { labels: 'failed' } } });
  const relatedSearching = snap.matches({ detail: { selected: { related: 'searching' } } });
  const relatedReady = snap.matches({ detail: { selected: { related: 'ready' } } });
  const relatedFailed = snap.matches({ detail: { selected: { related: 'failed' } } });

  return (
    <div>
      <label>
        Current user{' '}
        <input
          data-testid="user"
          value={c.user}
          onChange={(e) => actor.send({ type: 'USER', value: e.target.value })}
        />
      </label>

      <div>
        <button data-testid="filter-open" onClick={() => actor.send({ type: 'FILTER', filter: 'open' })}>
          open
        </button>
        <button data-testid="filter-closed" onClick={() => actor.send({ type: 'FILTER', filter: 'closed' })}>
          closed
        </button>
      </div>

      <div data-testid="list">
        {snap.matches({ list: 'loading' }) && <p>{`loading ${c.filter} issues`}</p>}
        {snap.matches({ list: 'failed' }) && <p>{`list error: ${c.listError}`}</p>}
        {listReady && rows && (
          <ul>
            {rows.map((i) => (
              <li key={i.id}>
                <button data-testid="issue" onClick={() => actor.send({ type: 'SELECT', id: i.id })}>
                  {`#${i.id} ${i.title} (${i.assignee ?? 'unassigned'})`}
                </button>
                <button data-testid="row-assign" onClick={() => actor.send({ type: 'ROW_ASSIGN', id: i.id })}>
                  {`assign to ${c.user}`}
                </button>
                {c.filter === 'open' && (
                  <button data-testid="row-close" onClick={() => actor.send({ type: 'ROW_CLOSE', id: i.id })}>
                    close
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {c.rowError !== undefined && <p data-testid="row-error">{`row error: ${c.rowError}`}</p>}

      <section data-testid="detail">
        {!selected || id === undefined ? (
          <p>select an issue</p>
        ) : (
          <>
            <button data-testid="retry" onClick={() => actor.send({ type: 'RETRY' })}>
              retry
            </button>
            {issueLoading && <p>{`loading #${id}`}</p>}
            {issueNotFound && <p>{`detail error: issue #${id} not found`}</p>}
            {issueFailed && <p>{`detail error: ${c.issueError}`}</p>}
            {issueReady && c.issue && (
              <div>
                <h2>{`#${c.issue.id} ${c.issue.title}`}</h2>
                <p>{c.issue.body}</p>
              </div>
            )}

            <div>
              <button data-testid="assign" onClick={() => actor.send({ type: 'ASSIGN' })}>
                {`assign to ${c.user}`}
              </button>
              {c.assignError !== undefined && <p data-testid="assign-error">{c.assignError}</p>}
            </div>

            <div>
              <input
                data-testid="title-input"
                value={c.titleDraft}
                onChange={(e) => actor.send({ type: 'TITLE', value: e.target.value })}
              />
              <button data-testid="rename" onClick={() => actor.send({ type: 'RENAME' })}>
                rename
              </button>
              {c.renameError !== undefined && <p data-testid="rename-error">{`rename error: ${c.renameError}`}</p>}
            </div>

            <div>
              <button data-testid="close" onClick={() => actor.send({ type: 'CLOSE' })}>
                close
              </button>
              {c.closeError !== undefined && <p data-testid="close-error">{`close error: ${c.closeError}`}</p>}
            </div>

            <div data-testid="comments">
              {commentsLoading && 'loading comments'}
              {commentsFailed && `comments error: ${c.commentsError}`}
              {commentsReady && (
                <ul>
                  {c.comments.map((cm) => (
                    <li key={cm.key} data-testid="comment">
                      {`${cm.author}: ${cm.text}${cm.sending ? ' (sending…)' : ''}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <input
                data-testid="comment-input"
                value={c.commentDraft}
                onChange={(e) => actor.send({ type: 'COMMENT', value: e.target.value })}
              />
              <button data-testid="post" onClick={() => actor.send({ type: 'POST' })}>
                post
              </button>
              {c.postError !== undefined && <p data-testid="post-error">{`post error: ${c.postError}`}</p>}
            </div>

            <div data-testid="labels">
              {labelsLoading && 'loading labels'}
              {labelsFailed && `labels error: ${c.labelsError}`}
              {labelsReady && (
                <ul>
                  {c.labels.map((l) => (
                    <li key={l}>
                      <span data-testid="label">{l}</span>
                      <button data-testid="remove-label" onClick={() => actor.send({ type: 'REMOVE_LABEL', label: l })}>
                        {`remove ${l}`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <input
                data-testid="label-input"
                value={c.labelDraft}
                onChange={(e) => actor.send({ type: 'LABEL', value: e.target.value })}
              />
              <button data-testid="add-label" onClick={() => actor.send({ type: 'ADD_LABEL' })}>
                add label
              </button>
              {c.labelError !== undefined && <p data-testid="label-error">{`label error: ${c.labelError}`}</p>}
            </div>

            <div data-testid="related">
              {relatedSearching && 'finding related help'}
              {relatedFailed && `related help failed: ${c.relatedError}`}
              {relatedReady &&
                (c.hits.length === 0 ? (
                  'no related help'
                ) : (
                  <div>
                    {c.hits.slice(0, 3).map((h) => (
                      <button
                        key={h.id}
                        data-testid="related-hit"
                        onClick={() => actor.send({ type: 'OPEN_RELATED', hitId: h.id })}
                      >
                        {h.name}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
