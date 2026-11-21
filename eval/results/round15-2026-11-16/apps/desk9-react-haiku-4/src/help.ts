import type { Dispatch } from "react";
import { fetchItem, search, type Hit, type Item } from "./api.js";
import { errorMessage, nextToken } from "./util";

export type SearchState = {
  token: number;
  status: "idle" | "short" | "searching" | "ok" | "error";
  /** the query the search was asked for */
  q: string;
  /** the query the hits on screen answer */
  resultsFor: string;
  hits: Hit[];
  error: string | null;
};

export type ItemState = {
  token: number;
  status: "idle" | "loading" | "ok" | "missing" | "error";
  data: Item | null;
  error: string | null;
};

export type HelpState = {
  query: string;
  search: SearchState;
  selectedId: number | null;
  item: ItemState;
};

export type HelpAction =
  | { type: "reset" }
  | { type: "query"; q: string; token: number }
  | { type: "searchOk"; token: number; hits: Hit[] }
  | { type: "searchErr"; token: number; error: string }
  | { type: "pick"; id: number; token: number }
  | { type: "itemOk"; token: number; item: Item | null }
  | { type: "itemErr"; token: number; error: string }
  | { type: "seed"; query: string; hitId: number; searchToken: number; itemToken: number };

export const INITIAL_HELP: HelpState = {
  query: "",
  search: { token: 0, status: "idle", q: "", resultsFor: "", hits: [], error: null },
  selectedId: null,
  item: { token: 0, status: "idle", data: null, error: null },
};

export function helpReducer(state: HelpState, action: HelpAction): HelpState {
  switch (action.type) {
    case "reset":
      return INITIAL_HELP;
    case "query": {
      const q = action.q;
      const prev = state.search;
      let next: SearchState;
      if (q.length === 0) {
        next = { token: action.token, status: "idle", q, resultsFor: "", hits: [], error: null };
      } else if (q.length === 1) {
        next = { token: action.token, status: "short", q, resultsFor: "", hits: [], error: null };
      } else {
        // results already on screen stay until the new ones replace them
        next = { token: action.token, status: "searching", q, resultsFor: prev.resultsFor, hits: prev.hits, error: null };
      }
      return { ...state, query: q, search: next };
    }
    case "searchOk":
      if (action.token !== state.search.token) return state;
      return {
        ...state,
        search: { ...state.search, status: "ok", resultsFor: state.search.q, hits: action.hits, error: null },
      };
    case "searchErr":
      if (action.token !== state.search.token) return state;
      return { ...state, search: { ...state.search, status: "error", hits: [], error: action.error } };
    case "pick":
      return {
        ...state,
        selectedId: action.id,
        item: { token: action.token, status: "loading", data: null, error: null },
      };
    case "itemOk":
      if (action.token !== state.item.token) return state;
      return {
        ...state,
        item: action.item
          ? { token: action.token, status: "ok", data: action.item, error: null }
          : { token: action.token, status: "missing", data: null, error: null },
      };
    case "itemErr":
      if (action.token !== state.item.token) return state;
      return { ...state, item: { token: action.token, status: "error", data: null, error: action.error } };
    case "seed":
      return {
        ...state,
        query: action.query,
        search: {
          token: action.searchToken,
          status: "searching",
          q: action.query,
          resultsFor: "",
          hits: [],
          error: null,
        },
        selectedId: action.hitId,
        item: { token: action.itemToken, status: "loading", data: null, error: null },
      };
    default:
      return state;
  }
}

type Send = Dispatch<HelpAction>;

function runSearch(d: Send, q: string, token: number): void {
  search(q).then(
    (hits) => d({ type: "searchOk", token, hits }),
    (e: unknown) => d({ type: "searchErr", token, error: errorMessage(e) }),
  );
}

function runItem(d: Send, id: number, token: number): void {
  fetchItem(id).then(
    (item) => d({ type: "itemOk", token, item }),
    (e: unknown) => d({ type: "itemErr", token, error: errorMessage(e) }),
  );
}

/** The query changed: one character asks nothing; two or more search. */
export function typeQuery(d: Send, q: string): void {
  const token = nextToken();
  d({ type: "query", q, token });
  if (q.length >= 2) runSearch(d, q, token);
}

/** A hit was clicked, or the item is asked again after a failure. */
export function pickHit(d: Send, id: number): void {
  const token = nextToken();
  d({ type: "pick", id, token });
  runItem(d, id, token);
}

/** The help page opened from a related hit: as if the title were typed and that hit clicked. */
export function seedHelp(d: Send, query: string, hitId: number): void {
  const searchToken = nextToken();
  const itemToken = nextToken();
  d({ type: "seed", query, hitId, searchToken, itemToken });
  runSearch(d, query, searchToken);
  runItem(d, hitId, itemToken);
}
