import { useEffect, useReducer, useRef } from "react";
import type { Dispatch, ReactNode } from "react";
import { fetchItem, search } from "./api.js";
import type { Hit, Item } from "./api.js";
import { messageOf } from "./errors";

/** A hit opened from elsewhere: the page starts with its query typed and the hit selected. */
export type Intent = { query: string; hit: Hit };

type Results =
  | { kind: "empty" }
  | { kind: "short"; q: string }
  | { kind: "searching"; prev: { q: string; hits: Hit[] } | null }
  | { kind: "hits"; q: string; hits: Hit[] }
  | { kind: "error"; message: string };

type ItemState =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "ok"; item: Item }
  | { kind: "missing"; id: number }
  | { kind: "error"; id: number; message: string };

type State = {
  query: string;
  /** request id of the latest search; older answers are ignored */
  req: number;
  results: Results;
  selected: number | null;
  itemReq: number;
  item: ItemState;
};

type Action =
  | { type: "typed"; q: string; req: number }
  | { type: "searchOk"; req: number; q: string; hits: Hit[] }
  | { type: "searchFailed"; req: number; message: string }
  | { type: "select"; id: number; req: number }
  | { type: "itemLoaded"; req: number; item: Item | null }
  | { type: "itemFailed"; req: number; message: string };

function initialState(intent: Intent | null): State {
  if (!intent) {
    return {
      query: "",
      req: 0,
      results: { kind: "empty" },
      selected: null,
      itemReq: 0,
      item: { kind: "none" },
    };
  }
  // The ids here match the ones the mount effect uses: search 1, item 2.
  return {
    query: intent.query,
    req: 1,
    results: { kind: "searching", prev: null },
    selected: intent.hit.id,
    itemReq: 2,
    item: { kind: "loading" },
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "typed": {
      const base = { ...state, query: action.q, req: action.req };
      if (action.q.length === 0) return { ...base, results: { kind: "empty" } };
      if (action.q.length === 1) return { ...base, results: { kind: "short", q: action.q } };
      // Keep what is on screen until the new hits replace it.
      const prev =
        state.results.kind === "hits"
          ? { q: state.results.q, hits: state.results.hits }
          : state.results.kind === "searching"
            ? state.results.prev
            : null;
      return { ...base, results: { kind: "searching", prev } };
    }
    case "searchOk":
      if (action.req !== state.req) return state;
      return { ...state, results: { kind: "hits", q: action.q, hits: action.hits } };
    case "searchFailed":
      if (action.req !== state.req) return state;
      return { ...state, results: { kind: "error", message: `search failed: ${action.message}` } };
    case "select":
      return { ...state, selected: action.id, itemReq: action.req, item: { kind: "loading" } };
    case "itemLoaded": {
      if (action.req !== state.itemReq || state.selected === null) return state;
      const item: ItemState = action.item
        ? { kind: "ok", item: action.item }
        : { kind: "missing", id: state.selected };
      return { ...state, item };
    }
    case "itemFailed":
      if (action.req !== state.itemReq || state.selected === null) return state;
      return {
        ...state,
        item: { kind: "error", id: state.selected, message: action.message },
      };
  }
  return state;
}

function startSearch(dispatch: Dispatch<Action>, req: number, q: string): void {
  search(q).then(
    (hits) => dispatch({ type: "searchOk", req, q, hits }),
    (e: unknown) => dispatch({ type: "searchFailed", req, message: messageOf(e) }),
  );
}

function startItem(dispatch: Dispatch<Action>, req: number, id: number): void {
  fetchItem(id).then(
    (item) => dispatch({ type: "itemLoaded", req, item }),
    (e: unknown) => dispatch({ type: "itemFailed", req, message: messageOf(e) }),
  );
}

export default function HelpPage({ intent }: { intent: Intent | null }) {
  const [state, dispatch] = useReducer(reducer, intent, initialState);
  // The first ids after the intent's (search 1, item 2) are 3 and up.
  const seq = useRef(2);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!intent) return;
    startSearch(dispatch, 1, intent.query);
    startItem(dispatch, 2, intent.hit.id);
  }, [intent]);

  const onType = (q: string) => {
    const req = ++seq.current;
    dispatch({ type: "typed", q, req });
    if (q.length >= 2) startSearch(dispatch, req, q);
  };

  const pick = (id: number) => {
    const req = ++seq.current;
    dispatch({ type: "select", id, req });
    startItem(dispatch, req, id);
  };

  const renderHits = (q: string, hits: Hit[]): ReactNode => (
    <>
      <p>{`${hits.length} results for ${q}`}</p>
      <ul>
        {hits.map((hit) => (
          <li
            key={hit.id}
            data-testid="hit"
            role="button"
            tabIndex={0}
            onClick={() => pick(hit.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pick(hit.id);
              }
            }}
          >
            {`${state.selected === hit.id ? "> " : ""}${hit.name}`}
          </li>
        ))}
      </ul>
    </>
  );

  const results = state.results;
  let resultsView: ReactNode = null;
  switch (results.kind) {
    case "empty":
      resultsView = null;
      break;
    case "short":
      resultsView = <p>{`too short: ${results.q}`}</p>;
      break;
    case "searching":
      resultsView = (
        <>
          <p>searching…</p>
          {results.prev && renderHits(results.prev.q, results.prev.hits)}
        </>
      );
      break;
    case "hits":
      resultsView = renderHits(results.q, results.hits);
      break;
    case "error":
      resultsView = <p>{results.message}</p>;
      break;
  }

  const itemState = state.item;
  let itemView: ReactNode = null;
  switch (itemState.kind) {
    case "none":
      itemView = <p>pick a result</p>;
      break;
    case "loading":
      itemView = <p>loading…</p>;
      break;
    case "ok":
      itemView = (
        <>
          <h3>{itemState.item.name}</h3>
          <p>{itemState.item.blurb}</p>
        </>
      );
      break;
    case "missing":
      itemView = <p>{`item ${itemState.id} not found`}</p>;
      break;
    case "error":
      itemView = (
        <>
          <p>{`failed: ${itemState.message}`}</p>
          <button type="button" data-testid="retry-item" onClick={() => pick(itemState.id)}>
            retry
          </button>
        </>
      );
      break;
  }

  return (
    <div>
      <label>
        Search help{" "}
        <input data-testid="query" value={state.query} onChange={(e) => onType(e.target.value)} />
      </label>
      <section data-testid="results" aria-label="results">
        {resultsView}
      </section>
      <section data-testid="item" aria-label="help item">
        {itemView}
      </section>
    </div>
  );
}
