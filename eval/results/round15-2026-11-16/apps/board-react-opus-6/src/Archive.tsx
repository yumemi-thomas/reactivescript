import { useEffect, useReducer } from "react";
import * as api from "./api.js";
import type { Archived } from "./api.js";
import { errorMessage, uid } from "./model";

type State = {
  list: { status: "loading"; req: number } | { status: "error"; req: number; message: string } | { status: "ok"; req: number; cards: Archived[] };
  /** ids whose restore is unanswered: hidden from the list */
  restoring: number[];
  restoreError: string | null;
};

type Action =
  | { type: "start"; req: number }
  | { type: "ok"; req: number; cards: Archived[] }
  | { type: "err"; req: number; message: string }
  | { type: "restore"; id: number }
  | { type: "restored"; id: number }
  | { type: "restoreFailed"; id: number; message: string };

const initial: State = { list: { status: "loading", req: 0 }, restoring: [], restoreError: null };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "start":
      return { ...state, list: { status: "loading", req: a.req } };
    case "ok":
      if (state.list.status !== "loading" || state.list.req !== a.req) return state;
      return { ...state, list: { status: "ok", req: a.req, cards: a.cards } };
    case "err":
      if (state.list.status !== "loading" || state.list.req !== a.req) return state;
      return { ...state, list: { status: "error", req: a.req, message: a.message } };
    case "restore":
      return { ...state, restoring: [...state.restoring, a.id], restoreError: null };
    case "restored": {
      const list = state.list.status === "ok" ? { ...state.list, cards: state.list.cards.filter(c => c.id !== a.id) } : state.list;
      return { ...state, list, restoring: state.restoring.filter(x => x !== a.id) };
    }
    case "restoreFailed":
      return { ...state, restoring: state.restoring.filter(x => x !== a.id), restoreError: a.message };
  }
}

export default function ArchivePage() {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    let live = true;
    api.fetchArchived().then(
      cards => { if (live) dispatch({ type: "ok", req: 0, cards }); },
      (e: unknown) => { if (live) dispatch({ type: "err", req: 0, message: errorMessage(e) }); },
    );
    return () => { live = false; };
  }, []);

  function retry() {
    const req = uid();
    dispatch({ type: "start", req });
    api.fetchArchived().then(
      cards => dispatch({ type: "ok", req, cards }),
      (e: unknown) => dispatch({ type: "err", req, message: errorMessage(e) }),
    );
  }

  function restore(id: number) {
    if (state.restoring.includes(id)) return;
    dispatch({ type: "restore", id });
    let p: Promise<unknown>;
    try { p = api.restoreCard(id); } catch (e) { p = Promise.reject(e); }
    p.then(
      () => dispatch({ type: "restored", id }),
      (e: unknown) => dispatch({ type: "restoreFailed", id, message: errorMessage(e) }),
    );
  }

  const { list } = state;
  return (
    <section className="archive-page">
      <h2>Archive</h2>
      {state.restoreError !== null && <p className="error" data-testid="restore-error" role="alert">restore error: {state.restoreError}</p>}
      <div data-testid="archived">
        {list.status === "loading" && <p className="muted">loading archive</p>}
        {list.status === "error" && (
          <div>
            <p className="error">archive error: {list.message}</p>
            <button type="button" data-testid="retry-archive" onClick={retry}>retry</button>
          </div>
        )}
        {list.status === "ok" && (
          <ul className="cards">
            {list.cards.filter(c => !state.restoring.includes(c.id)).map(c => (
              <li key={c.id} className="card-row">
                <span className="card" data-testid="archived-card">#{c.id} {c.title}</span>
                <button type="button" data-testid="restore" onClick={() => restore(c.id)}>restore</button>
              </li>
            ))}
          </ul>
        )}
        {list.status === "ok" && list.cards.length === 0 && <p className="muted">nothing archived</p>}
      </div>
    </section>
  );
}
