import type { Dispatch } from "react";
import { pickHit, typeQuery, type HelpAction, type HelpState } from "./help";

export function HelpPage({ state, dispatch }: { state: HelpState; dispatch: Dispatch<HelpAction> }) {
  const search = state.search;
  const item = state.item;
  const showHits =
    search.status === "ok" || (search.status === "searching" && search.hits.length > 0);

  return (
    <section aria-label="Help">
      <label>
        Search help{" "}
        <input
          data-testid="query"
          value={state.query}
          onChange={(e) => typeQuery(dispatch, e.target.value)}
        />
      </label>

      <div data-testid="results">
        {search.status === "short" && `too short: ${search.q}`}
        {search.status === "searching" && <p>searching…</p>}
        {search.status === "error" && `search failed: ${search.error ?? ""}`}
        {showHits && (
          <>
            <p>{`${search.hits.length} results for ${search.resultsFor}`}</p>
            <ul>
              {search.hits.map((hit) => (
                <li key={hit.id}>
                  <button type="button" data-testid="hit" onClick={() => pickHit(dispatch, hit.id)}>
                    {`${state.selectedId === hit.id ? "> " : ""}${hit.name}`}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div data-testid="item">
        {item.status === "idle" && "pick a result"}
        {item.status === "loading" && "loading…"}
        {item.status === "ok" && item.data && (
          <>
            <h2>{item.data.name}</h2>
            <p>{item.data.blurb}</p>
          </>
        )}
        {item.status === "missing" && `item ${state.selectedId ?? ""} not found`}
        {item.status === "error" && (
          <>
            <p>{`failed: ${item.error ?? ""}`}</p>
            <button
              type="button"
              data-testid="retry-item"
              onClick={() => {
                if (state.selectedId !== null) pickHit(dispatch, state.selectedId);
              }}
            >
              retry
            </button>
          </>
        )}
      </div>
    </section>
  );
}
