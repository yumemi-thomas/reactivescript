import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { helpMachine, MIN_QUERY } from "./helpMachine";

export function HelpPage({ actor }: { actor: ActorRefFrom<typeof helpMachine> }) {
  const snapshot = useSelector(actor, s => s);
  const ctx = snapshot.context;
  const send = actor.send;

  return (
    <section className="help">
      <label>
        Search help{" "}
        <input
          data-testid="query"
          type="search"
          value={ctx.query}
          onChange={e => send({ type: "query.change", value: e.target.value })}
        />
      </label>

      <div data-testid="results" className="results" aria-busy={snapshot.matches({ search: "searching" })}>
        {ctx.query.length > 0 && ctx.query.length < MIN_QUERY && <p>{`too short: ${ctx.query}`}</p>}
        {ctx.query.length >= MIN_QUERY && (
          <>
            {snapshot.matches({ search: "searching" }) && <p>searching…</p>}
            {snapshot.matches({ search: "failed" }) && <p className="error">{`search failed: ${ctx.searchError}`}</p>}
            {ctx.results && (
              <>
                <p>{`${ctx.results.hits.length} results for ${ctx.results.query}`}</p>
                <ul>
                  {ctx.results.hits.map(hit => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        data-testid="hit"
                        aria-pressed={hit.id === ctx.selected}
                        onClick={() => send({ type: "hit.select", id: hit.id })}
                      >
                        {hit.id === ctx.selected ? `> ${hit.name}` : hit.name}
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
        {snapshot.matches({ item: "none" }) && <p>pick a result</p>}
        {snapshot.matches({ item: "loading" }) && <p>loading…</p>}
        {snapshot.matches({ item: "loaded" }) && ctx.item && (
          <>
            <h2>{ctx.item.name}</h2>
            <p>{ctx.item.blurb}</p>
          </>
        )}
        {snapshot.matches({ item: "notFound" }) && <p className="error">{`item ${ctx.selected} not found`}</p>}
        {snapshot.matches({ item: "failed" }) && (
          <>
            <p className="error">{`failed: ${ctx.itemError}`}</p>
            <button type="button" data-testid="retry-item" onClick={() => send({ type: "item.retry" })}>
              retry
            </button>
          </>
        )}
      </div>
    </section>
  );
}
