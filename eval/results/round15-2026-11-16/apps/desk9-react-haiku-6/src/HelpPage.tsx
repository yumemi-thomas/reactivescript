import { useEffect, useReducer } from "react";
import type { Dispatch } from "react";
import { fetchItem, search } from "./api.js";
import type { Hit, Item } from "./api.js";
import { messageOf } from "./errors";
import type { Result } from "./errors";

export interface HelpSeed {
  query: string;
  hit: Hit;
}

interface Results {
  q: string;
  pending: boolean;
  hits: Hit[];
  error: string | null;
}

interface State {
  query: string;
  results: Results;
  selected: number | null;
  item: Result<Item | null> | null;
  attempt: number;
}

type Action =
  | { type: "query"; value: string }
  | { type: "results"; q: string; result: Result<Hit[]> }
  | { type: "select"; id: number }
  | { type: "item"; id: number; result: Result<Item | null> }
  | { type: "retry-item" };

function initialState(seed: HelpSeed | null): State {
  if (seed === null) {
    return { query: "", results: { q: "", pending: false, hits: [], error: null }, selected: null, item: null, attempt: 0 };
  }
  return {
    query: seed.query,
    results: { q: seed.query, pending: seed.query.length >= 2, hits: [], error: null },
    selected: seed.hit.id,
    item: null,
    attempt: 0,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "query": {
      if (action.value.length < 2) return { ...state, query: action.value };
      return {
        ...state,
        query: action.value,
        results: { q: action.value, pending: true, hits: state.results.hits, error: null },
      };
    }
    case "results": {
      if (action.q !== state.query) return state;
      const result = action.result;
      const results: Results =
        result.kind === "ok"
          ? { q: action.q, pending: false, hits: result.value, error: null }
          : { q: action.q, pending: false, hits: [], error: result.message };
      return { ...state, results };
    }
    case "select":
      if (action.id === state.selected) return state;
      return { ...state, selected: action.id, item: null, attempt: 0 };
    case "item":
      if (action.id !== state.selected) return state;
      return { ...state, item: action.result };
    case "retry-item":
      return { ...state, item: null, attempt: state.attempt + 1 };
  }
}

function Hits({ hits, selected, onSelect }: { hits: Hit[]; selected: number | null; onSelect: (id: number) => void }) {
  return (
    <ul>
      {hits.map((hit) => (
        <li key={hit.id}>
          <button type="button" data-testid="hit" onClick={() => onSelect(hit.id)}>
            {hit.id === selected ? `> ${hit.name}` : hit.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ResultsView({
  state,
  dispatch,
}: {
  state: State;
  dispatch: Dispatch<Action>;
}) {
  const { results } = state;
  const onSelect = (id: number) => dispatch({ type: "select", id });
  if (state.query.length < 2) return null;
  if (results.pending) {
    return (
      <>
        <p>searching…</p>
        <Hits hits={results.hits} selected={state.selected} onSelect={onSelect} />
      </>
    );
  }
  if (results.error !== null) {
    return <p role="alert">{`search failed: ${results.error}`}</p>;
  }
  return (
    <>
      <p>{`${results.hits.length} results for ${results.q}`}</p>
      <Hits hits={results.hits} selected={state.selected} onSelect={onSelect} />
    </>
  );
}

function ItemView({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const { selected, item } = state;
  if (selected === null) return <p>pick a result</p>;
  if (item === null) return <p>loading…</p>;
  if (item.kind === "error") {
    return (
      <>
        <p role="alert">{`failed: ${item.message}`}</p>
        <button type="button" data-testid="retry-item" onClick={() => dispatch({ type: "retry-item" })}>
          retry
        </button>
      </>
    );
  }
  if (item.value === null) return <p>{`item ${selected} not found`}</p>;
  return (
    <>
      <h2>{item.value.name}</h2>
      <p>{item.value.blurb}</p>
    </>
  );
}

export default function HelpPage({ seed }: { seed: HelpSeed | null }) {
  const [state, dispatch] = useReducer(reducer, seed, initialState);
  const { query, selected, attempt } = state;

  useEffect(() => {
    if (query.length < 2) return;
    let stale = false;
    search(query).then(
      (value) => {
        if (!stale) dispatch({ type: "results", q: query, result: { kind: "ok", value } });
      },
      (error: unknown) => {
        if (!stale) dispatch({ type: "results", q: query, result: { kind: "error", message: messageOf(error) } });
      },
    );
    return () => {
      stale = true;
    };
  }, [query]);

  useEffect(() => {
    if (selected === null) return;
    const id = selected;
    let stale = false;
    fetchItem(id).then(
      (value) => {
        if (!stale) dispatch({ type: "item", id, result: { kind: "ok", value } });
      },
      (error: unknown) => {
        if (!stale) dispatch({ type: "item", id, result: { kind: "error", message: messageOf(error) } });
      },
    );
    return () => {
      stale = true;
    };
  }, [selected, attempt]);

  return (
    <section aria-label="Help">
      <label>
        Search{" "}
        <input data-testid="query" value={state.query} onChange={(e) => dispatch({ type: "query", value: e.target.value })} />
      </label>

      <div data-testid="results" aria-live="polite">
        {state.query.length === 1 && <p>{`too short: ${state.query}`}</p>}
        <ResultsView state={state} dispatch={dispatch} />
      </div>

      <section data-testid="item" aria-label="Help item">
        <ItemView state={state} dispatch={dispatch} />
      </section>
    </section>
  );
}
