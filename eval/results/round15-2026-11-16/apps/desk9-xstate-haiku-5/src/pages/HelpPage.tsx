import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { helpMachine } from '../machines/help';

type HelpRef = ActorRefFrom<typeof helpMachine>;

export function HelpPage({ actor }: { actor: HelpRef }) {
  const snap = useSelector(actor, (s) => s);
  const ctx = snap.context;
  const searching = snap.matches({ search: 'searching' });
  const searchDone = snap.matches({ search: 'done' });
  const searchFailed = snap.matches({ search: 'failed' });
  const itemLoading = snap.matches({ item: 'loading' });
  const itemShown = snap.matches({ item: 'shown' });
  const itemNotFound = snap.matches({ item: 'notFound' });
  const itemFailed = snap.matches({ item: 'failed' });
  const queryLength = ctx.query.length;

  return (
    <section aria-label="Help" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label>
          Search help{' '}
          <input
            data-testid="query"
            value={ctx.query}
            onChange={(e) => actor.send({ type: 'SET_QUERY', value: e.target.value })}
          />
        </label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div data-testid="results" style={{ flex: '1 1 280px', minWidth: 0 }}>
          {queryLength === 1 && `too short: ${ctx.query}`}
          {queryLength >= 2 && searching && <p>searching…</p>}
          {queryLength >= 2 && searchDone && <p>{`${ctx.hits.length} results for ${ctx.hitsFor}`}</p>}
          {searchFailed && <p>{`search failed: ${ctx.searchError ?? ''}`}</p>}
          <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
            {ctx.hits.map((hit) => (
              <li key={hit.id} style={{ marginBottom: 4 }}>
                <button data-testid="hit" onClick={() => actor.send({ type: 'SELECT_HIT', id: hit.id })}>
                  {ctx.selectedId === hit.id ? `> ${hit.name}` : hit.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div data-testid="item" style={{ flex: '2 1 320px', minWidth: 0 }}>
          {ctx.selectedId === null && <p>pick a result</p>}
          {itemLoading && <p>loading…</p>}
          {itemShown && ctx.item && (
            <>
              <h3 style={{ margin: '0 0 6px' }}>{ctx.item.name}</h3>
              <p style={{ margin: 0 }}>{ctx.item.blurb}</p>
            </>
          )}
          {itemNotFound && <p>{`item ${ctx.selectedId ?? ''} not found`}</p>}
          {itemFailed && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>{`failed: ${ctx.itemError ?? ''}`}</span>
              <button data-testid="retry-item" onClick={() => actor.send({ type: 'RETRY_ITEM' })}>
                retry
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
