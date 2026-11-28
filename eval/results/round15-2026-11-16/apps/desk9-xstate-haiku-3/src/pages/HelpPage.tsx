import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { helpMachine } from '../machines/help.js';

export type HelpActor = ActorRefFrom<typeof helpMachine>;

export function HelpPage({ actor }: { actor: HelpActor }) {
  const snap = useSelector(actor, (s) => s);
  const c = snap.context;

  const hitList = (
    <ul>
      {c.hits.map((h) => (
        <li key={h.id}>
          <button data-testid="hit" onClick={() => actor.send({ type: 'SELECT_HIT', id: h.id })}>
            {`${h.id === c.selectedId ? '> ' : ''}${h.name}`}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <input
        data-testid="query"
        value={c.query}
        onChange={(e) => actor.send({ type: 'QUERY', value: e.target.value })}
      />

      <div data-testid="results">
        {snap.matches({ results: 'tooShort' }) && `too short: ${c.query}`}
        {snap.matches({ results: 'searching' }) && (
          <>
            <p>searching…</p>
            {hitList}
          </>
        )}
        {snap.matches({ results: 'ready' }) && (
          <>
            <p>{`${c.hits.length} results for ${c.query}`}</p>
            {hitList}
          </>
        )}
        {snap.matches({ results: 'failed' }) && `search failed: ${c.searchError}`}
      </div>

      <section data-testid="item">
        {snap.matches({ pane: 'none' }) && <p>pick a result</p>}
        {snap.matches({ pane: 'loading' }) && <p>loading…</p>}
        {snap.matches({ pane: 'ready' }) && c.item && (
          <div>
            <h3>{c.item.name}</h3>
            <p>{c.item.blurb}</p>
          </div>
        )}
        {snap.matches({ pane: 'missing' }) && <p>{`item ${c.selectedId} not found`}</p>}
        {snap.matches({ pane: 'failed' }) && (
          <div>
            <p>{`failed: ${c.itemError}`}</p>
            <button data-testid="retry-item" onClick={() => actor.send({ type: 'RETRY_ITEM' })}>
              retry
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
