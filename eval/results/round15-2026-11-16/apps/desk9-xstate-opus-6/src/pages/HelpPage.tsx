import { useSelector } from "@xstate/react";
import type { ActorRefFrom, SnapshotFrom } from "xstate";
import { helpMachine, MIN_QUERY } from "../machines/helpMachine";

type HelpActor = ActorRefFrom<typeof helpMachine>;
const identity = (s: SnapshotFrom<typeof helpMachine>) => s;

export function HelpPage({ actor }: { actor: HelpActor }) {
  const snapshot = useSelector(actor, identity);
  const ctx = snapshot.context;
  const send = actor.send;
  const searching = snapshot.matches({ search: "searching" });

  return (
    <div className="issues">
      <section aria-label="Search help">
        <label>
          Search help{" "}
          <input
            data-testid="query"
            type="search"
            value={ctx.query}
            onChange={(e) => send({ type: "query.change", value: e.target.value })}
          />
        </label>
        <div className="section" data-testid="results" aria-busy={searching} aria-live="polite">
          {ctx.query.length > 0 && ctx.query.length < MIN_QUERY && <p className="muted">{`too short: ${ctx.query}`}</p>}
          {searching && <p className="muted">searching…</p>}
          {snapshot.matches({ search: "failed" }) && <p className="error">{`search failed: ${ctx.searchError}`}</p>}
          {ctx.results && ctx.query.length >= MIN_QUERY && (
            <>
              <p>{`${ctx.results.hits.length} results for ${ctx.results.q}`}</p>
              <ul className="rows">
                {ctx.results.hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      data-testid="hit"
                      className={hit.id === ctx.selectedId ? "hit selected" : "hit"}
                      aria-current={hit.id === ctx.selectedId ? "true" : undefined}
                      onClick={() => send({ type: "hit.select", id: hit.id })}
                    >
                      {hit.id === ctx.selectedId ? `> ${hit.name}` : hit.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
      <section className="panel" data-testid="item" aria-label="Help item" aria-live="polite">
        {snapshot.matches({ item: "none" }) && <p className="muted">pick a result</p>}
        {snapshot.matches({ item: "loading" }) && <p className="muted">loading…</p>}
        {snapshot.matches({ item: "notFound" }) && <p className="error">{`item ${ctx.selectedId ?? ""} not found`}</p>}
        {snapshot.matches({ item: "ready" }) && ctx.item && (
          <>
            <h2>{ctx.item.name}</h2>
            <p>{ctx.item.blurb}</p>
          </>
        )}
        {snapshot.matches({ item: "failed" }) && (
          <>
            <p className="error">{`failed: ${ctx.itemError}`}</p>
            <button type="button" data-testid="retry-item" onClick={() => send({ type: "item.retry" })}>
              retry
            </button>
          </>
        )}
      </section>
    </div>
  );
}
