import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { issuesMachine } from '../machines/issues';

type IssuesRef = ActorRefFrom<typeof issuesMachine>;

export function IssuesPage({ actor }: { actor: IssuesRef }) {
  const snap = useSelector(actor, (s) => s);
  const ctx = snap.context;
  const selected = snap.matches({ selection: 'selected' });
  const detailLoading = snap.matches({ selection: { selected: { detail: 'loading' } } });
  const detailReady = snap.matches({ selection: { selected: { detail: 'ready' } } });
  const detailNotFound = snap.matches({ selection: { selected: { detail: 'notFound' } } });
  const detailFailed = snap.matches({ selection: { selected: { detail: 'failed' } } });
  const relatedSearching = snap.matches({ selection: { selected: { detail: { ready: 'searching' } } } });
  const relatedFailed = snap.matches({ selection: { selected: { detail: { ready: 'failed' } } } });
  const commentsLoading = snap.matches({ selection: { selected: { comments: 'loading' } } });
  const commentsFailed = snap.matches({ selection: { selected: { comments: 'failed' } } });
  const commentsReady = snap.matches({ selection: { selected: { comments: 'ready' } } });
  const labelsLoading = snap.matches({ selection: { selected: { labels: 'loading' } } });
  const labelsFailed = snap.matches({ selection: { selected: { labels: 'failed' } } });
  const labelsReady = snap.matches({ selection: { selected: { labels: 'ready' } } });
  const listLoading = snap.matches({ list: 'loading' });
  const listFailed = snap.matches({ list: 'failed' });
  const listReady = snap.matches({ list: 'ready' });
  const issueTitle = ctx.issue?.title ?? '';

  return (
    <section aria-label="Issues" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label>
          Current user{' '}
          <input
            data-testid="user"
            value={ctx.user}
            onChange={(e) => actor.send({ type: 'SET_USER', value: e.target.value })}
          />
        </label>
      </div>
      <div role="group" aria-label="Filter" style={{ display: 'flex', gap: 8 }}>
        <button
          data-testid="filter-open"
          aria-pressed={ctx.filter === 'open'}
          onClick={() => actor.send({ type: 'SET_FILTER', filter: 'open' })}
        >
          Open
        </button>
        <button
          data-testid="filter-closed"
          aria-pressed={ctx.filter === 'closed'}
          onClick={() => actor.send({ type: 'SET_FILTER', filter: 'closed' })}
        >
          Closed
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div data-testid="list">
            {listLoading && `loading ${ctx.filter} issues`}
            {listFailed && `list error: ${ctx.listError ?? ''}`}
            {listReady && (
              <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
                {ctx.items.map((issue) => (
                  <li key={issue.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <button
                      data-testid="issue"
                      onClick={() => actor.send({ type: 'SELECT', id: issue.id })}
                    >
                      {`#${issue.id} ${issue.title} (${issue.assignee ?? 'unassigned'})`}
                    </button>
                    <button data-testid="row-assign" onClick={() => actor.send({ type: 'ROW_ASSIGN', id: issue.id })}>
                      {`assign to ${ctx.user}`}
                    </button>
                    {ctx.filter === 'open' && (
                      <button data-testid="row-close" onClick={() => actor.send({ type: 'ROW_CLOSE', id: issue.id })}>
                        close
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {ctx.errors.row !== null && <p data-testid="row-error">{`row error: ${ctx.errors.row}`}</p>}
        </div>

        <div data-testid="detail" style={{ flex: '2 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!selected && <p>select an issue</p>}
          {selected && (
            <>
              {detailLoading && <p>{`loading #${ctx.selectedId ?? ''}`}</p>}
              {detailNotFound && <p>{`detail error: issue #${ctx.selectedId ?? ''} not found`}</p>}
              {detailFailed && <p>{`detail error: ${ctx.detailError ?? ''}`}</p>}
              {detailReady && ctx.issue && (
                <>
                  <h2 style={{ margin: 0 }}>{`#${ctx.issue.id} ${ctx.issue.title}`}</h2>
                  <p style={{ margin: 0 }}>{ctx.issue.body}</p>
                </>
              )}
              <div>
                <button data-testid="retry" onClick={() => actor.send({ type: 'RETRY' })}>
                  retry
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button data-testid="assign" onClick={() => actor.send({ type: 'ASSIGN_DETAIL' })}>
                  {`assign to ${ctx.user}`}
                </button>
                {ctx.errors.assign !== null && <p data-testid="assign-error">{ctx.errors.assign}</p>}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  data-testid="title-input"
                  value={ctx.titleDraft}
                  onChange={(e) => actor.send({ type: 'SET_TITLE_DRAFT', value: e.target.value })}
                />
                <button data-testid="rename" onClick={() => actor.send({ type: 'RENAME' })}>
                  rename
                </button>
                {ctx.errors.rename !== null && <p>{`rename error: ${ctx.errors.rename}`}</p>}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button data-testid="close" onClick={() => actor.send({ type: 'CLOSE_DETAIL' })}>
                  close
                </button>
                {ctx.errors.close !== null && <p>{`close error: ${ctx.errors.close}`}</p>}
              </div>

              <section data-testid="comments">
                {commentsLoading && 'loading comments'}
                {commentsFailed && `comments error: ${ctx.commentsError ?? ''}`}
                <ul style={{ paddingLeft: 16 }}>
                  {ctx.comments.map((c) => (
                    <li key={c.key} data-testid="comment">
                      {`${c.author}: ${c.text}${c.pending ? ' (sending…)' : ''}`}
                    </li>
                  ))}
                </ul>
              </section>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  data-testid="comment-input"
                  value={ctx.commentDraft}
                  onChange={(e) => actor.send({ type: 'SET_COMMENT_DRAFT', value: e.target.value })}
                />
                <button data-testid="post" onClick={() => actor.send({ type: 'POST' })}>
                  post
                </button>
                {ctx.errors.post !== null && <p>{`post error: ${ctx.errors.post}`}</p>}
              </div>

              <section data-testid="labels">
                {labelsLoading && 'loading labels'}
                {labelsFailed && `labels error: ${ctx.labelsError ?? ''}`}
                <ul style={{ paddingLeft: 16 }}>
                  {ctx.labels.map((label) => (
                    <li key={label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span data-testid="label">{label}</span>
                      <button
                        data-testid="remove-label"
                        onClick={() => actor.send({ type: 'REMOVE_LABEL', label })}
                      >
                        {`remove ${label}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  data-testid="label-input"
                  value={ctx.labelDraft}
                  onChange={(e) => actor.send({ type: 'SET_LABEL_DRAFT', value: e.target.value })}
                />
                <button data-testid="add-label" onClick={() => actor.send({ type: 'ADD_LABEL' })}>
                  add label
                </button>
                {ctx.errors.label !== null && <p>{`label error: ${ctx.errors.label}`}</p>}
              </div>

              {detailReady && (
                <section data-testid="related">
                  {relatedSearching && 'finding related help'}
                  {relatedFailed && `related help failed: ${ctx.relatedError ?? ''}`}
                  {!relatedSearching && !relatedFailed && ctx.related.length === 0 && 'no related help'}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ctx.related.map((hit) => (
                      <button
                        key={hit.id}
                        data-testid="related-hit"
                        onClick={() => actor.send({ type: 'OPEN_RELATED', query: issueTitle, hitId: hit.id })}
                      >
                        {hit.name}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
