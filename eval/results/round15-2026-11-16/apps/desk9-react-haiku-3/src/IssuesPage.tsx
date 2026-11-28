import { useEffect, useReducer, useRef } from "react";
import type { Dispatch } from "react";
import { assign, closeIssue, fetchIssue, fetchIssues, renameIssue } from "./api.js";
import type { Hit } from "./api.js";
import { messageOf } from "./errors";
import IssueDetail from "./IssueDetail";
import { initialState, reducer } from "./issuesState";
import type { Action, Filter, Origin } from "./issuesState";

type Props = {
  /** told the open-issue count whenever the open list is shown */
  onOpenCount: (count: number) => void;
  onOpenHelp: (query: string, hit: Hit) => void;
};

function loadList(dispatch: Dispatch<Action>, req: number, filter: Filter): void {
  fetchIssues(filter).then(
    (rows) => dispatch({ type: "listLoaded", req, rows }),
    (e: unknown) => dispatch({ type: "listFailed", req, message: messageOf(e) }),
  );
}

function loadDetail(dispatch: Dispatch<Action>, req: number, id: number): void {
  fetchIssue(id).then(
    (issue) => dispatch({ type: "detailLoaded", req, issue }),
    (e: unknown) => dispatch({ type: "detailFailed", req, message: messageOf(e) }),
  );
}

export default function IssuesPage({ onOpenCount, onOpenHelp }: Props) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  // Request and operation ids. The first list request is id 1, set in initialState.
  const seq = useRef(1);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    loadList(dispatch, 1, "open");
  }, []);

  const openRows = state.list.status === "ok" && state.filter === "open" ? state.list.rows : null;
  useEffect(() => {
    if (openRows) onOpenCount(openRows.length);
  }, [openRows, onOpenCount]);

  const changeFilter = (filter: Filter) => {
    if (filter === state.filter) return;
    const req = ++seq.current;
    dispatch({ type: "setFilter", filter, req });
    loadList(dispatch, req, filter);
  };

  const select = (id: number) => {
    const req = ++seq.current;
    dispatch({ type: "select", id, req });
    loadDetail(dispatch, req, id);
  };

  const retry = () => {
    const id = state.selected;
    if (id === null) return;
    const req = ++seq.current;
    dispatch({ type: "retryDetail", req });
    loadDetail(dispatch, req, id);
  };

  const assignTo = (origin: Origin, id: number) => {
    const user = state.user.trim();
    if (!user) return;
    const opId = ++seq.current;
    dispatch({ type: "assignStart", opId, origin, id, user });
    assign(id, user).then(
      (result) => dispatch({ type: "opOk", opId, assignee: result.assignee }),
      (e: unknown) => dispatch({ type: "opFail", opId, message: messageOf(e) }),
    );
  };

  const renameTo = (origin: Origin, id: number, title: string) => {
    const opId = ++seq.current;
    dispatch({ type: "renameStart", opId, origin, id, title });
    renameIssue(id, title).then(
      (result) => dispatch({ type: "opOk", opId, title: result.title }),
      (e: unknown) => dispatch({ type: "opFail", opId, message: messageOf(e) }),
    );
  };

  const closeOne = (origin: Origin, id: number) => {
    const opId = ++seq.current;
    dispatch({ type: "closeStart", opId, origin, id });
    closeIssue(id).then(
      () => dispatch({ type: "opOk", opId }),
      (e: unknown) => dispatch({ type: "opFail", opId, message: messageOf(e) }),
    );
  };

  const selected = state.selected;
  const { list, filter, user } = state;

  return (
    <div>
      <div>
        <label>
          Current user{" "}
          <input
            data-testid="user"
            value={user}
            onChange={(e) => dispatch({ type: "setUser", user: e.target.value })}
          />
        </label>
      </div>

      <div>
        <button
          type="button"
          data-testid="filter-open"
          aria-pressed={filter === "open"}
          onClick={() => changeFilter("open")}
        >
          Open
        </button>
        <button
          type="button"
          data-testid="filter-closed"
          aria-pressed={filter === "closed"}
          onClick={() => changeFilter("closed")}
        >
          Closed
        </button>
      </div>

      <section data-testid="list" aria-label="issues">
        {list.status === "loading" && <p>{`loading ${filter} issues`}</p>}
        {list.status === "error" && <p>{`list error: ${list.message}`}</p>}
        {list.status === "ok" && (
          <ul>
            {list.rows.map((row) => (
              <li key={row.id}>
                <div
                  data-testid="issue"
                  role="button"
                  tabIndex={0}
                  onClick={() => select(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      select(row.id);
                    }
                  }}
                >
                  {`#${row.id} ${row.title} (${row.assignee ?? "unassigned"})`}
                </div>
                <button type="button" data-testid="row-assign" onClick={() => assignTo("row", row.id)}>
                  {`assign to ${user}`}
                </button>
                {filter === "open" && (
                  <button type="button" data-testid="row-close" onClick={() => closeOne("row", row.id)}>
                    close
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {state.rowError && <p data-testid="row-error">{state.rowError}</p>}

      {selected === null ? (
        <section data-testid="detail">
          <p>select an issue</p>
        </section>
      ) : (
        <IssueDetail
          key={selected}
          id={selected}
          user={user}
          detail={state.detail}
          errors={state.errors}
          onRetry={retry}
          onAssign={() => assignTo("detail", selected)}
          onRename={(title) => renameTo("detail", selected, title)}
          onClose={() => closeOne("detail", selected)}
          onOpenHelp={onOpenHelp}
        />
      )}
    </div>
  );
}
