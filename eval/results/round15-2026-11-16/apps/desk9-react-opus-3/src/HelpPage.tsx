import { useEffect, useReducer } from "react";
import * as api from "./api";
import type { Hit, Item } from "./api";
import { errorMessage, newId, type Loaded } from "./util";

export type HelpStart = { query: string; hits: Hit[]; selected: number };

type Results = { seq: number; q: string; ok: true; hits: Hit[] } | { seq: number; q: string; ok: false; message: string };

type HelpState = {
  query: string;
  qSeq: number;
  /** the query generation whose results were handed in at the start, so it is not searched again */
  seeded: number | null;
  results: Results | null;
  sel: number | null;
  itemGen: number;
  item: Loaded<Item | null> | null;
};

type HelpAction =
  | { type: "query"; query: string; seq: number }
  | { type: "results"; results: Results }
  | { type: "select"; id: number; gen: number }
  | { type: "retry"; gen: number }
  | { type: "item"; result: Loaded<Item | null> };

function init(start: HelpStart | null): HelpState {
  if (!start) return { query: "", qSeq: 0, seeded: null, results: null, sel: null, itemGen: 0, item: null };
  return {
    query: start.query,
    qSeq: 0,
    seeded: 0,
    results: { seq: 0, q: start.query, ok: true, hits: start.hits },
    sel: start.selected,
    itemGen: 0,
    item: null,
  };
}

function reducer(state: HelpState, action: HelpAction): HelpState {
  switch (action.type) {
    case "query":
      return {
        ...state,
        query: action.query,
        qSeq: action.seq,
        results: action.query.length < 2 ? null : state.results,
      };
    case "results":
      return action.results.seq === state.qSeq ? { ...state, results: action.results } : state;
    case "select":
      return action.id === state.sel ? state : { ...state, sel: action.id, itemGen: action.gen };
    case "retry":
      return state.sel === null ? state : { ...state, itemGen: action.gen };
    case "item":
      return action.result.gen === state.itemGen ? { ...state, item: action.result } : state;
  }
}

export default function HelpPage({ start }: { start: HelpStart | null }) {
  const [state, dispatch] = useReducer(reducer, start, init);
  const { query, qSeq, seeded, sel, itemGen } = state;

  useEffect(() => {
    if (query.length < 2 || seeded === qSeq) return;
    let live = true;
    api.search(query).then(
      hits => {
        if (live) dispatch({ type: "results", results: { seq: qSeq, q: query, ok: true, hits } });
      },
      (e: unknown) => {
        if (live) dispatch({ type: "results", results: { seq: qSeq, q: query, ok: false, message: errorMessage(e) } });
      },
    );
    return () => {
      live = false;
    };
  }, [query, qSeq, seeded]);

  useEffect(() => {
    if (sel === null) return;
    let live = true;
    api.fetchItem(sel).then(
      data => {
        if (live) dispatch({ type: "item", result: { gen: itemGen, ok: true, data } });
      },
      (e: unknown) => {
        if (live) dispatch({ type: "item", result: { gen: itemGen, ok: false, message: errorMessage(e) } });
      },
    );
    return () => {
      live = false;
    };
  }, [sel, itemGen]);

  const searching = query.length >= 2 && state.results?.seq !== qSeq;
  const results = state.results;
  const item = state.item && state.item.gen === itemGen ? state.item : null;

  return (
    <section className="help">
      <label className="search">
        Search help{" "}
        <input
          data-testid="query"
          type="search"
          value={query}
          onChange={e => dispatch({ type: "query", query: e.target.value, seq: newId() })}
        />
      </label>
      <div className="split">
        <div data-testid="results" className="results" aria-busy={searching}>
          {query.length === 0 ? null : query.length === 1 ? (
            <p className="muted">too short: {query}</p>
          ) : (
            <>
              {searching && <p className="muted">searching…</p>}
              {results && results.ok ? (
                <>
                  <p>
                    {results.hits.length} results for {results.q}
                  </p>
                  <ul>
                    {results.hits.map(hit => (
                      <li key={hit.id}>
                        <button
                          data-testid="hit"
                          aria-current={hit.id === sel ? "true" : undefined}
                          onClick={() => dispatch({ type: "select", id: hit.id, gen: newId() })}
                        >
                          {hit.id === sel ? `> ${hit.name}` : hit.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : results && !results.ok && !searching ? (
                <p className="error">search failed: {results.message}</p>
              ) : null}
            </>
          )}
        </div>
        <div data-testid="item" className="item">
          {sel === null ? (
            <p className="muted">pick a result</p>
          ) : !item ? (
            <p className="muted">loading…</p>
          ) : !item.ok ? (
            <>
              <p className="error">failed: {item.message}</p>
              <button data-testid="retry-item" onClick={() => dispatch({ type: "retry", gen: newId() })}>
                retry
              </button>
            </>
          ) : !item.data ? (
            <p className="muted">item {sel} not found</p>
          ) : (
            <>
              <h2>{item.data.name}</h2>
              <p>{item.data.blurb}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
