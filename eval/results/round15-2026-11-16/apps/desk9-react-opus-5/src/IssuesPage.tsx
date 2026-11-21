import { useEffect, useState, type Dispatch } from "react";
import * as api from "./api.js";
import type { Hit, Issue } from "./api.js";
import { Detail } from "./Detail";
import { applyOps, type Filter, type IssuesAction, type IssuesStore } from "./issuesStore";
import { errorMessage, nextId, tick } from "./util";

export type IssueActions = {
  assign(id: number, user: string, onDecline: (message: string) => void): void;
  rename(id: number, title: string, onDecline: (message: string) => void): void;
  close(id: number, onDecline: (message: string) => void): void;
};

type ListState =
  | { view: number; status: "ok"; data: Issue[]; startedAt: number }
  | { view: number; status: "error"; error: string };

export function IssuesPage({
  store,
  dispatch,
  onOpenRelated,
}: {
  store: IssuesStore;
  dispatch: Dispatch<IssuesAction>;
  onOpenRelated: (query: string, hits: Hit[], hit: Hit) => void;
}) {
  const [user, setUser] = useState("guest");
  const [view, setView] = useState<{ filter: Filter; n: number }>({ filter: "open", n: 0 });
  const [list, setList] = useState<ListState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const filter = view.filter;
  const viewN = view.n;
  useEffect(() => {
    let live = true;
    const startedAt = tick();
    api.fetchIssues(filter).then(
      data => {
        if (!live) return;
        setList({ view: viewN, status: "ok", data, startedAt });
        if (filter === "open") dispatch({ type: "openLoaded", list: data, startedAt });
      },
      (e: unknown) => {
        if (live) setList({ view: viewN, status: "error", error: errorMessage(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [filter, viewN, dispatch]);

  const current = list !== null && list.view === viewN ? list : null;
  const rows = current?.status === "ok" ? applyOps(current.data, store.ops, filter, current.startedAt) : null;

  const actions: IssueActions = {
    assign(id, who, onDecline) {
      const opId = nextId();
      dispatch({ type: "start", op: { opId, kind: "assign", id, value: who, doneAt: null } });
      api.assign(id, who).then(
        res => dispatch({ type: "done", opId, at: tick(), value: res.assignee }),
        (e: unknown) => {
          dispatch({ type: "fail", opId });
          onDecline(errorMessage(e));
        },
      );
    },
    rename(id, title, onDecline) {
      const opId = nextId();
      dispatch({ type: "start", op: { opId, kind: "rename", id, value: title, doneAt: null } });
      api.renameIssue(id, title).then(
        res => dispatch({ type: "done", opId, at: tick(), value: res.title }),
        (e: unknown) => {
          dispatch({ type: "fail", opId });
          onDecline(errorMessage(e));
        },
      );
    },
    close(id, onDecline) {
      const opId = nextId();
      dispatch({ type: "start", op: { opId, kind: "close", id, value: "", doneAt: null } });
      api.closeIssue(id).then(
        () => dispatch({ type: "done", opId, at: tick() }),
        (e: unknown) => {
          dispatch({ type: "fail", opId });
          onDecline(errorMessage(e));
        },
      );
    },
  };

  const who = user.trim();

  function switchFilter(next: Filter) {
    if (next === filter) return;
    setView({ filter: next, n: viewN + 1 });
  }

  function rowAssign(id: number) {
    if (who === "") return;
    setRowError(null);
    actions.assign(id, who, m => setRowError(`row error: ${m}`));
  }

  function rowClose(id: number) {
    setRowError(null);
    actions.close(id, m => setRowError(`row error: ${m}`));
  }

  return (
    <div>
      <div className="field">
        <label htmlFor="user">Current user</label>
        <input id="user" data-testid="user" value={user} onChange={e => setUser(e.target.value)} />
        <span role="group" aria-label="Filter" className="row">
          <button data-testid="filter-open" aria-pressed={filter === "open"} onClick={() => switchFilter("open")}>
            Open
          </button>
          <button data-testid="filter-closed" aria-pressed={filter === "closed"} onClick={() => switchFilter("closed")}>
            Closed
          </button>
        </span>
      </div>
      {rowError !== null && (
        <p data-testid="row-error" className="error" role="alert">
          {rowError}
        </p>
      )}
      <div className="cols">
        <div className="panel" data-testid="list">
          {current === null && <p className="muted">loading {filter} issues</p>}
          {current?.status === "error" && <p className="error">list error: {current.error}</p>}
          {rows !== null && (
            <ul>
              {rows.map(issue => (
                <li key={issue.id} className="row">
                  <button
                    className="issue-btn"
                    data-testid="issue"
                    aria-current={issue.id === selected}
                    onClick={() => setSelected(issue.id)}
                  >
                    {`#${issue.id} ${issue.title} (${issue.assignee ?? "unassigned"})`}
                  </button>
                  <button data-testid="row-assign" onClick={() => rowAssign(issue.id)}>
                    {`assign to ${user}`}
                  </button>
                  {filter === "open" && (
                    <button data-testid="row-close" onClick={() => rowClose(issue.id)}>
                      close
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel" data-testid="detail">
          {selected === null ? (
            <p className="muted">select an issue</p>
          ) : (
            <Detail
              key={selected}
              id={selected}
              user={user}
              ops={store.ops}
              actions={actions}
              onOpenRelated={onOpenRelated}
            />
          )}
        </div>
      </div>
    </div>
  );
}
