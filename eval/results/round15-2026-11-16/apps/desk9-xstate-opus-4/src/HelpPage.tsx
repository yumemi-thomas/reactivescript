import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { helpMachine } from "./helpMachine";

type HelpActor = ActorRefFrom<typeof helpMachine>;

export function HelpPage({ actor }: { actor: HelpActor }) {
  const snapshot = useSelector(actor, s => s);
  const c = snapshot.context;
  const send = actor.send;
  const results = (s: "empty" | "tooShort" | "searching" | "ready" | "failed") => snapshot.matches({ results: s });
  const item = (s: "none" | "loading" | "loaded" | "notFound" | "failed") => snapshot.matches({ item: s });

  const showHits = (results("ready") || results("searching")) && c.hitsFor !== null;

  return (
    <section className="page help-page" aria-label="Help">
      <label className="field">
        <span>Search help</span>
        <input
          data-testid="query"
          type="search"
          value={c.query}
          onChange={e => send({ type: "query.change", value: e.target.value })}
          autoComplete="off"
        />
      </label>
      <div className="columns">
        <div className="pane" data-testid="results" aria-live="polite">
          {results("tooShort") && <p className="muted">too short: {c.query}</p>}
          {results("searching") && <p className="muted">searching…</p>}
          {results("failed") && <p className="error">search failed: {c.searchError}</p>}
          {showHits && (
            <>
              <p>
                {c.hits.length} results for {c.hitsFor}
              </p>
              <ul className="rows">
                {c.hits.map(hit => (
                  <li key={hit.id}>
                    <button
                      className="row-main"
                      data-testid="hit"
                      aria-current={hit.id === c.selectedId}
                      onClick={() => send({ type: "hit.select", id: hit.id })}
                    >
                      {hit.id === c.selectedId ? `> ${hit.name}` : hit.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="pane" data-testid="item" aria-live="polite">
          {item("none") && <p className="muted">pick a result</p>}
          {item("loading") && <p className="muted">loading…</p>}
          {item("loaded") && c.item && (
            <>
              <h2>{c.item.name}</h2>
              <p className="body">{c.item.blurb}</p>
            </>
          )}
          {item("notFound") && <p className="error">item {c.selectedId} not found</p>}
          {item("failed") && (
            <>
              <p className="error">failed: {c.itemError}</p>
              <button data-testid="retry-item" onClick={() => send({ type: "item.retry" })}>
                retry
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
