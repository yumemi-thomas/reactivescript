import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { helpMachine, MIN_QUERY } from "./helpMachine";

export function HelpPage({ actor }: { actor: ActorRefFrom<typeof helpMachine> }) {
  const state = useSelector(actor, s => s);
  const ctx = state.context;
  const send = actor.send;
  const q = ctx.query;

  return (
    <section className="help">
      <label>
        Search help{" "}
        <input data-testid="query" value={q} onChange={e => send({ type: "QUERY", value: e.target.value })} />
      </label>
      <div className="columns">
        <div data-testid="results" className="results">
          {q.length > 0 && q.length < MIN_QUERY && <p>too short: {q}</p>}
          {q.length >= MIN_QUERY && (
            <>
              {state.matches({ search: "searching" }) && <p>searching…</p>}
              {state.matches({ search: "failed" }) && <p className="error">search failed: {ctx.searchError}</p>}
              {ctx.results && (
                <>
                  <p>
                    {ctx.results.hits.length} results for {ctx.results.q}
                  </p>
                  <ul>
                    {ctx.results.hits.map(hit => (
                      <li key={hit.id}>
                        <button type="button" data-testid="hit" aria-pressed={hit.id === ctx.selectedId} onClick={() => send({ type: "SELECT_HIT", id: hit.id })}>
                          {hit.id === ctx.selectedId ? `> ${hit.name}` : hit.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
        <div data-testid="item" className="item">
          {state.matches({ item: "none" }) && <p>pick a result</p>}
          {state.matches({ item: "loading" }) && <p>loading…</p>}
          {state.matches({ item: "notFound" }) && <p className="error">item {ctx.selectedId} not found</p>}
          {state.matches({ item: "failed" }) && (
            <>
              <p className="error">failed: {ctx.itemError}</p>
              <button type="button" data-testid="retry-item" onClick={() => send({ type: "RETRY_ITEM" })}>
                retry
              </button>
            </>
          )}
          {state.matches({ item: "loaded" }) && ctx.item && (
            <>
              <h2>{ctx.item.name}</h2>
              <p>{ctx.item.blurb}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
