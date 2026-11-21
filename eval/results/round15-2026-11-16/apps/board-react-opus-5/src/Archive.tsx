import { useEffect, useReducer, useRef } from "react";
import * as api from "./api";
import type { Archived } from "./api";
import { errorMessage } from "./board";

type State = {
  status: "loading" | "error" | "ok";
  error: string;
  items: Archived[];
  req: number;
  /** ids whose restore is in flight */
  restoring: number[];
  restoreError: string | null;
};

type Action =
  | { type: "loading"; req: number }
  | { type: "loaded"; req: number; items: Archived[] }
  | { type: "failed"; req: number; message: string }
  | { type: "restoreStart"; id: number }
  | { type: "restoreDone"; id: number }
  | { type: "restoreFailed"; id: number; message: string };

const initial: State = { status: "loading", error: "", items: [], req: 0, restoring: [], restoreError: null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loading":
      return { ...state, status: "loading", error: "", items: [], req: action.req };
    case "loaded":
      if (action.req !== state.req) return state;
      return { ...state, status: "ok", items: action.items };
    case "failed":
      if (action.req !== state.req) return state;
      return { ...state, status: "error", error: action.message };
    case "restoreStart":
      return { ...state, restoring: [...state.restoring, action.id], restoreError: null };
    case "restoreDone":
      return {
        ...state,
        restoring: state.restoring.filter(id => id !== action.id),
        items: state.items.filter(it => it.id !== action.id),
      };
    case "restoreFailed":
      return { ...state, restoring: state.restoring.filter(id => id !== action.id), restoreError: action.message };
  }
}

function load(dispatch: (a: Action) => void, req: number, live: () => boolean = () => true) {
  api.fetchArchived().then(
    items => { if (live()) dispatch({ type: "loaded", req, items }); },
    err => { if (live()) dispatch({ type: "failed", req, message: errorMessage(err) }); },
  );
}

export default function Archive() {
  const [state, dispatch] = useReducer(reducer, initial);
  const counter = useRef(0);

  useEffect(() => {
    let live = true;
    load(dispatch, 0, () => live);
    return () => { live = false; };
  }, []);

  const retry = () => {
    const req = ++counter.current;
    dispatch({ type: "loading", req });
    load(dispatch, req);
  };

  const restore = (id: number) => {
    if (state.restoring.includes(id)) return;
    dispatch({ type: "restoreStart", id });
    let p: Promise<unknown>;
    try { p = api.restoreCard(id); } catch (err) { p = Promise.reject(err); }
    p.then(
      () => dispatch({ type: "restoreDone", id }),
      err => dispatch({ type: "restoreFailed", id, message: errorMessage(err) }),
    );
  };

  const shown = state.items.filter(it => !state.restoring.includes(it.id));

  return (
    <div className="archive-page">
      <h2>Archive</h2>
      {state.restoreError !== null && (
        <p className="error" data-testid="restore-error" role="alert">restore error: {state.restoreError}</p>
      )}
      <div data-testid="archived">
        {state.status === "loading" && <p className="muted">loading archive</p>}
        {state.status === "error" && (
          <div className="error" role="alert">
            <span>archive error: {state.error}</span>{" "}
            <button type="button" data-testid="retry-archive" onClick={retry}>retry</button>
          </div>
        )}
        {state.status === "ok" && (
          shown.length === 0 ? <p className="muted">nothing archived</p> : (
            <ul className="cards">
              {shown.map(it => (
                <li key={it.id} className="card-row">
                  <span className="card" data-testid="archived-card">#{it.id} {it.title}</span>
                  <button type="button" data-testid="restore" aria-label={`restore #${it.id}`} onClick={() => restore(it.id)}>restore</button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
