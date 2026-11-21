import { useEffect } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { appMachine } from '../machines/app.js';
import {
  issuesMachine,
  openCountOf,
  pendingComments,
  shownTitle,
  viewLabels,
  viewRows,
} from '../machines/issues.js';

type AppRef = ActorRefFrom<typeof appMachine>;

export function IssuesPage({ app }: { app: AppRef }) {
  const issues = useActorRef(issuesMachine);
  const snap = useSelector(issues, (s) => s);
  const ctx = snap.context;
  const send = issues.send;

  const count = openCountOf(ctx, snap.matches({ list: 'loaded' }));
  useEffect(() => {
    if (count !== null) app.send({ type: 'OPEN_COUNT', count });
  }, [app, count]);

  const rows = viewRows(ctx);
  const selectedId = ctx.selectedId;
  const selectedIssue = ctx.selectedIssue;
  const heading =
    selectedId !== null && selectedIssue !== null ? shownTitle(ctx, selectedId, selectedIssue.title) : '';

  const detailPhase = snap.matches({ selection: { selected: { detail: 'loading' } } })
    ? 'loading'
    : snap.matches({ selection: { selected: { detail: 'notFound' } } })
      ? 'notFound'
      : snap.matches({ selection: { selected: { detail: 'failed' } } })
        ? 'failed'
        : snap.matches({ selection: { selected: { detail: 'shown' } } })
          ? 'shown'
          : 'none';
  const relatedPhase = snap.matches({
    selection: { selected: { detail: { shown: { related: 'searching' } } } },
  })
    ? 'searching'
    : snap.matches({ selection: { selected: { detail: { shown: { related: 'found' } } } } })
      ? 'found'
      : snap.matches({ selection: { selected: { detail: { shown: { related: 'failed' } } } } })
        ? 'failed'
        : 'none';
  const commentsPhase = snap.matches({ selection: { selected: { comments: 'loading' } } })
    ? 'loading'
    : snap.matches({ selection: { selected: { comments: 'failed' } } })
      ? 'failed'
      : 'loaded';
  const labelsPhase = snap.matches({ selection: { selected: { labels: 'loading' } } })
    ? 'loading'
    : snap.matches({ selection: { selected: { labels: 'failed' } } })
      ? 'failed'
      : 'loaded';

  const listPhase = snap.matches({ list: 'loading' })
    ? 'loading'
    : snap.matches({ list: 'failed' })
      ? 'failed'
      : 'loaded';

  const labels = viewLabels(ctx);
  const comments = pendingComments(ctx);
  const shownRelated = ctx.related.slice(0, 3);

  return (
    <section aria-label="Issues">
      <label>
        Current user{' '}
        <input data-testid="user" value={ctx.user} onChange={(e) => send({ type: 'SET_USER', value: e.target.value })} />
      </label>

      <div>
        <button
          data-testid="filter-open"
          type="button"
          aria-pressed={ctx.filter === 'open'}
          onClick={() => send({ type: 'SET_FILTER', filter: 'open' })}
        >
          Open
        </button>
        <button
          data-testid="filter-closed"
          type="button"
          aria-pressed={ctx.filter === 'closed'}
          onClick={() => send({ type: 'SET_FILTER', filter: 'closed' })}
        >
          Closed
        </button>
      </div>

      {ctx.rowError !== null && <p data-testid="row-error">{ctx.rowError}</p>}

      <div className="split">
        <section data-testid="list" aria-live="polite">
          {listPhase === 'loading' && <p>{`loading ${ctx.filter} issues`}</p>}
          {listPhase === 'failed' && <p>{`list error: ${ctx.listError}`}</p>}
          {listPhase === 'loaded' && (
            <ul>
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    data-testid="issue"
                    type="button"
                    onClick={() => send({ type: 'SELECT', id: row.id })}
                  >
                    {`#${row.id} ${row.title} (${row.assignee ?? 'unassigned'})`}
                  </button>
                  <button data-testid="row-assign" type="button" onClick={() => send({ type: 'ROW_ASSIGN', id: row.id })}>
                    {`assign to ${ctx.user}`}
                  </button>
                  {ctx.filter === 'open' && (
                    <button data-testid="row-close" type="button" onClick={() => send({ type: 'ROW_CLOSE', id: row.id })}>
                      close
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section data-testid="detail" aria-label="Issue detail">
          {selectedId === null && <p>select an issue</p>}
          {selectedId !== null && (
            <>
              {detailPhase === 'loading' && <p>{`loading #${selectedId}`}</p>}
              {detailPhase === 'notFound' && <p>{`detail error: issue #${selectedId} not found`}</p>}
              {detailPhase === 'failed' && <p>{`detail error: ${ctx.detailError}`}</p>}
              {detailPhase === 'shown' && selectedIssue !== null && (
                <>
                  <h2>{`#${selectedId} ${heading}`}</h2>
                  <p>{selectedIssue.body}</p>
                </>
              )}
              <button data-testid="retry" type="button" onClick={() => send({ type: 'RETRY_DETAIL' })}>
                retry
              </button>

              <div>
                <button data-testid="assign" type="button" onClick={() => send({ type: 'DETAIL_ASSIGN' })}>
                  {`assign to ${ctx.user}`}
                </button>
                {ctx.errors.assign !== undefined && <p>{`assign error: ${ctx.errors.assign}`}</p>}
              </div>

              <div>
                <input
                  data-testid="title-input"
                  aria-label="New title"
                  value={ctx.titleDraft}
                  onChange={(e) => send({ type: 'SET_TITLE', value: e.target.value })}
                />
                <button data-testid="rename" type="button" onClick={() => send({ type: 'DETAIL_RENAME' })}>
                  rename
                </button>
                {ctx.errors.rename !== undefined && <p>{`rename error: ${ctx.errors.rename}`}</p>}
              </div>

              <div>
                <button data-testid="close" type="button" onClick={() => send({ type: 'DETAIL_CLOSE' })}>
                  close
                </button>
                {ctx.errors.close !== undefined && <p>{`close error: ${ctx.errors.close}`}</p>}
              </div>

              <div data-testid="comments">
                {commentsPhase === 'loading' && <p>loading comments</p>}
                {commentsPhase === 'failed' && <p>{`comments error: ${ctx.commentsError}`}</p>}
                {commentsPhase === 'loaded' && (
                  <ul>
                    {ctx.comments.map((c, i) => (
                      <li key={`c-${i}`} data-testid="comment">{`${c.author}: ${c.text}`}</li>
                    ))}
                    {comments.map((c, i) => (
                      <li key={`p-${i}`} data-testid="comment">{`${c.author}: ${c.text} (sending…)`}</li>
                    ))}
                  </ul>
                )}
                <input
                  data-testid="comment-input"
                  aria-label="New comment"
                  value={ctx.commentDraft}
                  onChange={(e) => send({ type: 'SET_COMMENT', value: e.target.value })}
                />
                <button data-testid="post" type="button" onClick={() => send({ type: 'POST' })}>
                  post
                </button>
                {ctx.errors.post !== undefined && <p>{`post error: ${ctx.errors.post}`}</p>}
              </div>

              <div data-testid="labels">
                {labelsPhase === 'loading' && <p>loading labels</p>}
                {labelsPhase === 'failed' && <p>{`labels error: ${ctx.labelsError}`}</p>}
                {labelsPhase === 'loaded' && (
                  <ul>
                    {labels.map((label) => (
                      <li key={label}>
                        <span data-testid="label">{label}</span>
                        <button
                          data-testid="remove-label"
                          type="button"
                          onClick={() => send({ type: 'REMOVE_LABEL', label })}
                        >
                          {`remove ${label}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <input
                  data-testid="label-input"
                  aria-label="New label"
                  value={ctx.labelDraft}
                  onChange={(e) => send({ type: 'SET_LABEL', value: e.target.value })}
                />
                <button data-testid="add-label" type="button" onClick={() => send({ type: 'ADD_LABEL' })}>
                  add label
                </button>
                {ctx.errors.label !== undefined && <p>{`label error: ${ctx.errors.label}`}</p>}
              </div>

              {detailPhase === 'shown' && (
                <div data-testid="related">
                  {relatedPhase === 'searching' && <p>finding related help</p>}
                  {relatedPhase === 'failed' && <p>{`related help failed: ${ctx.relatedError}`}</p>}
                  {relatedPhase === 'found' && shownRelated.length === 0 && <p>no related help</p>}
                  {relatedPhase === 'found' &&
                    shownRelated.map((hit) => (
                      <button
                        key={hit.id}
                        data-testid="related-hit"
                        type="button"
                        onClick={() =>
                          app.send({
                            type: 'OPEN_HELP',
                            query: heading,
                            hitId: hit.id,
                          })
                        }
                      >
                        {hit.name}
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
