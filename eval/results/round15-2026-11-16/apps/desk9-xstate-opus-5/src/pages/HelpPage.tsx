import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { helpMachine } from "../machines/help";

type HelpActor = ActorRefFrom<typeof helpMachine>;

export function HelpPage({ actor }: { actor: HelpActor }) {
  const snapshot = useSelector(actor, s => s);
  const { context } = snapshot;
  const { send } = actor;
  const searching = snapshot.matches({ results: "searching" });

  let results = null;
  if (snapshot.matches({ results: "tooShort" })) {
    results = <p className="muted">too short: {context.query}</p>;
  } else if (snapshot.matches({ results: "failed" })) {
    results = <p className="error">search failed: {context.searchError}</p>;
  } else if (!snapshot.matches({ results: "empty" })) {
    const showHits = context.hitsQuery !== "";
    results = (
      <>
        {searching && <p className="muted">searching…</p>}
        {showHits && (
          <>
            <p>
              {context.hits.length} results for {context.hitsQuery}
            </p>
            <ul className="hits">
              {context.hits.map(hit => {
                const selected = hit.id === context.selectedHitId;
                return (
                  <li key={hit.id} data-testid="hit" aria-current={selected}>
                    <button
                      type="button"
                      className="hit-button"
                      onClick={() => send({ type: "hit.select", id: hit.id })}
                    >
                      {selected ? `> ${hit.name}` : hit.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </>
    );
  }

  let item;
  if (snapshot.matches({ item: "loading" })) {
    item = <p className="muted">loading…</p>;
  } else if (snapshot.matches({ item: "loaded" }) && context.item) {
    item = (
      <>
        <h2>{context.item.name}</h2>
        <p>{context.item.blurb}</p>
      </>
    );
  } else if (snapshot.matches({ item: "notFound" })) {
    item = <p className="error">item {context.selectedHitId} not found</p>;
  } else if (snapshot.matches({ item: "failed" })) {
    item = (
      <p className="error">
        failed: {context.itemError}{" "}
        <button type="button" data-testid="retry-item" onClick={() => send({ type: "item.retry" })}>
          retry
        </button>
      </p>
    );
  } else {
    item = <p className="muted">pick a result</p>;
  }

  return (
    <div className="issues">
      <section className="panel">
        <input
          data-testid="query"
          type="search"
          aria-label="search help"
          placeholder="search help"
          value={context.query}
          onChange={e => send({ type: "query.change", value: e.target.value })}
        />
        <div data-testid="results" aria-live="polite">
          {results}
        </div>
      </section>
      <section className="panel" data-testid="item">
        {item}
      </section>
    </div>
  );
}
