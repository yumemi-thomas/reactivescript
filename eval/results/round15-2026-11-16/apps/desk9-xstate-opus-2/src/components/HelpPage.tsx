import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { helpMachine } from "../machines/help";

type Props = { helpRef: ActorRefFrom<typeof helpMachine> };

export function HelpPage({ helpRef }: Props) {
  const ctx = useSelector(helpRef, (s) => s.context);
  const searchState = useSelector(helpRef, (s) =>
    s.matches({ search: "tooShort" })
      ? "tooShort"
      : s.matches({ search: "searching" })
        ? "searching"
        : s.matches({ search: "ready" })
          ? "ready"
          : s.matches({ search: "failed" })
            ? "failed"
            : "idle",
  );
  const itemState = useSelector(helpRef, (s) =>
    s.matches({ item: "loading" })
      ? "loading"
      : s.matches({ item: "loaded" })
        ? "loaded"
        : s.matches({ item: "notFound" })
          ? "notFound"
          : s.matches({ item: "failed" })
            ? "failed"
            : "none",
  );

  const { results } = ctx;
  const showResults = (searchState === "ready" || searchState === "searching") && results !== null;

  return (
    <div className="help">
      <label className="field">
        <span>Search help</span>
        <input
          data-testid="query"
          type="search"
          value={ctx.query}
          onChange={(e) => helpRef.send({ type: "query.change", value: e.target.value })}
        />
      </label>
      <div className="columns">
        <section className="results" data-testid="results" aria-live="polite" aria-busy={searchState === "searching"}>
          {searchState === "tooShort" && <p className="muted">too short: {ctx.query}</p>}
          {searchState === "searching" && <p className="muted">searching…</p>}
          {searchState === "failed" && (
            <p className="error" role="alert">
              search failed: {ctx.searchError}
            </p>
          )}
          {showResults && (
            <>
              <p>
                {results.hits.length} results for {results.q}
              </p>
              <ul className="hits">
                {results.hits.map((hit) => {
                  const selected = hit.id === ctx.selectedId;
                  return (
                    <li
                      key={hit.id}
                      data-testid="hit"
                      className={selected ? "hit selected" : "hit"}
                      aria-selected={selected}
                      role="option"
                      tabIndex={0}
                      onClick={() => helpRef.send({ type: "hit.select", id: hit.id })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          helpRef.send({ type: "hit.select", id: hit.id });
                        }
                      }}
                    >
                      {selected ? `> ${hit.name}` : hit.name}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
        <section className="item" data-testid="item" aria-live="polite">
          {itemState === "none" && <p className="muted">pick a result</p>}
          {itemState === "loading" && <p className="muted">loading…</p>}
          {itemState === "loaded" && ctx.item && (
            <>
              <h2>{ctx.item.name}</h2>
              <p>{ctx.item.blurb}</p>
            </>
          )}
          {itemState === "notFound" && <p className="error">item {ctx.selectedId} not found</p>}
          {itemState === "failed" && (
            <>
              <p className="error" role="alert">
                failed: {ctx.itemError}
              </p>
              <button type="button" data-testid="retry-item" onClick={() => helpRef.send({ type: "item.retry" })}>
                retry
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
