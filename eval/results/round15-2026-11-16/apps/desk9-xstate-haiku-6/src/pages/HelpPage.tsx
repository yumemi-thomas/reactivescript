import { useActorRef, useSelector } from '@xstate/react';
import { helpMachine } from '../machines/help.js';
import type { HelpInput } from '../machines/help.js';

export function HelpPage({ input }: { input: HelpInput | null }) {
  const help = useActorRef(helpMachine, { input: input ?? { query: '', hitId: null } });
  const snap = useSelector(help, (s) => s);
  const ctx = snap.context;
  const send = help.send;

  const searching = snap.matches({ search: 'searching' });
  const showHits = searching || snap.matches({ search: 'results' });

  const itemPhase = snap.matches({ item: 'loading' })
    ? 'loading'
    : snap.matches({ item: 'shown' })
      ? 'shown'
      : snap.matches({ item: 'notFound' })
        ? 'notFound'
        : snap.matches({ item: 'failed' })
          ? 'failed'
          : 'none';

  return (
    <section aria-label="Help">
      <label>
        Search help{' '}
        <input data-testid="query" value={ctx.query} onChange={(e) => send({ type: 'TYPE', value: e.target.value })} />
      </label>

      <div className="split">
        <section data-testid="results" aria-live="polite">
          {snap.matches({ search: 'tooShort' }) && <p>{`too short: ${ctx.query}`}</p>}
          {searching && <p>searching…</p>}
          {snap.matches({ search: 'failed' }) && <p>{`search failed: ${ctx.searchError}`}</p>}
          {snap.matches({ search: 'results' }) && <p>{`${ctx.hits.length} results for ${ctx.resultsFor}`}</p>}
          {showHits && (
            <ul>
              {ctx.hits.map((hit) => (
                <li key={hit.id}>
                  <button data-testid="hit" type="button" onClick={() => send({ type: 'SELECT_HIT', id: hit.id })}>
                    {`${ctx.selectedId === hit.id ? '> ' : ''}${hit.name}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section data-testid="item" aria-live="polite">
          {itemPhase === 'none' && <p>pick a result</p>}
          {itemPhase === 'loading' && <p>loading…</p>}
          {itemPhase === 'shown' && ctx.item !== null && (
            <>
              <h3>{ctx.item.name}</h3>
              <p>{ctx.item.blurb}</p>
            </>
          )}
          {itemPhase === 'notFound' && <p>{`item ${ctx.selectedId} not found`}</p>}
          {itemPhase === 'failed' && (
            <>
              <p>{`failed: ${ctx.itemError}`}</p>
              <button data-testid="retry-item" type="button" onClick={() => send({ type: 'RETRY_ITEM' })}>
                retry
              </button>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
