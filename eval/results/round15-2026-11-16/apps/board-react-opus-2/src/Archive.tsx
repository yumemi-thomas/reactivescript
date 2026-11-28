import { useEffect, useReducer } from "react";
import * as api from "./api.js";
import type { Archived } from "./api.js";

type State = {
  status: "loading" | "error" | "success";
  token: number;
  items: Archived[];
  error: string | null;
  /** ids with a restore in flight: off the list until the server answers */
  restoring: number[];
  restoreError: string | null;
};

type Action =
  | { type: "start"; token: number }
  | { type: "ok"; token: number; items: Archived[] }
  | { type: "fail"; token: number; error: string }
  | { type: "restoreStart"; id: number }
  | { type: "restoreOk"; id: number }
  | { type: "restoreFail"; id: number; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { ...state, status: "loading", token: action.token, error: null };
    case "ok":
      if (action.token !== state.token) return state;
      return { ...state, status: "success", items: action.items, error: null };
    case "fail":
      if (action.token !== state.token) return state;
      return { ...state, status: "error", error: action.error };
    case "restoreStart":
      return { ...state, restoring: [...state.restoring, action.id], restoreError: null };
    case "restoreOk":
      return { ...state, restoring: state.restoring.filter(x => x !== action.id), items: state.items.filter(x => x.id !== action.id) };
    case "restoreFail":
      return { ...state, restoring: state.restoring.filter(x => x !== action.id), restoreError: action.error };
  }
}

const initial: State = { status: "loading", token: 0, items: [], error: null, restoring: [], restoreError: null };
let counter = 1;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function load(dispatch: (a: Action) => void, token: number, isCancelled: () => boolean = () => false) {
  api.fetchArchived().then(
    items => { if (!isCancelled()) dispatch({ type: "ok", token, items }); },
    e => { if (!isCancelled()) dispatch({ type: "fail", token, error: message(e) }); },
  );
}

export default function Archive() {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    let cancelled = false;
    load(dispatch, 0, () => cancelled);
    return () => { cancelled = true; };
  }, []);

  const retry = () => {
    const token = counter++;
    dispatch({ type: "start", token });
    load(dispatch, token);
  };

  const restore = (id: number) => {
    dispatch({ type: "restoreStart", id });
    api.restoreCard(id).then(
      () => dispatch({ type: "restoreOk", id }),
      e => dispatch({ type: "restoreFail", id, error: message(e) }),
    );
  };

  const rows = state.items.filter(x => !state.restoring.includes(x.id));

  return (
    <div className="archive-page">
      <h2>Archive</h2>
      {state.restoreError !== null && <p className="error" data-testid="restore-error" aria-live="polite">restore error: {state.restoreError}</p>}
      <div className="archived" data-testid="archived">
        {state.status === "loading" && <p className="muted">loading archive</p>}
        {state.status === "error" && (
          <div className="error-box">
            <p className="error">archive error: {state.error}</p>
            <button type="button" data-testid="retry-archive" onClick={retry}>retry</button>
          </div>
        )}
        {state.status === "success" && (
          rows.length === 0 ? <p className="muted">nothing archived</p> : (
            <ul className="archived-list">
              {rows.map(row => (
                <li key={row.id} className="archived-row">
                  <span data-testid="archived-card">#{row.id} {row.title}</span>
                  <button type="button" data-testid="restore" onClick={() => restore(row.id)}>restore</button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
