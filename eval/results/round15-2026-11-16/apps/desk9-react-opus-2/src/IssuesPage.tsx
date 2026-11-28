import { useEffect, useState, type Dispatch } from "react";
import { fetchIssues, type Issue } from "./api";
import { Detail } from "./Detail";
import type { HelpSeed } from "./HelpPage";
import { shownIssues, type IssueActions, type IssuesAction, type IssuesState } from "./store";
import { errorMessage, nextSeq, type Async } from "./util";

type Filter = "open" | "closed";

type Props = {
  store: IssuesState;
  dispatch: Dispatch<IssuesAction>;
  actions: IssueActions;
  onOpenHelp: (seed: HelpSeed) => void;
};

export function IssuesPage({ store, dispatch, actions, onOpenHelp }: Props) {
  const [user, setUser] = useState("guest");
  const [filter, setFilter] = useState<Filter>("open");
  const [selected, setSelected] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [list, setList] = useState<{ filter: Filter; result: Async<Issue[]> } | null>(null);

  useEffect(() => {
    let live = true;
    const seq = nextSeq();
    fetchIssues(filter).then(
      issues => {
        if (!live) return;
        setList({ filter, result: { status: "ok", data: issues, seq } });
        if (filter === "open") dispatch({ type: "openLoaded", issues, seq });
      },
      (e: unknown) => {
        if (live) setList({ filter, result: { status: "error", message: errorMessage(e) } });
      },
    );
    return () => {
      live = false;
    };
  }, [filter, dispatch]);

  const result: Async<Issue[]> = list !== null && list.filter === filter ? list.result : { status: "loading" };
  const who = user.trim();

  async function rowAssign(id: number) {
    if (!who) return;
    setRowError(null);
    const err = await actions.assign(id, who);
    if (err !== null) setRowError(err);
  }

  async function rowClose(id: number) {
    setRowError(null);
    const err = await actions.close(id);
    if (err !== null) setRowError(err);
  }

  return (
    <section className="issues">
      <div className="toolbar">
        <label className="field">
          <span>Current user</span>
          <input data-testid="user" value={user} onChange={e => setUser(e.target.value)} autoComplete="username" />
        </label>
        <div className="segmented" role="group" aria-label="Filter">
          {(["open", "closed"] as const).map(f => (
            <button
              key={f}
              type="button"
              data-testid={`filter-${f}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {rowError !== null && (
        <p className="error" role="alert" data-testid="row-error">
          row error: {rowError}
        </p>
      )}
      <div className="split">
        <div className="list" data-testid="list" aria-busy={result.status === "loading"}>
          {result.status === "loading" && <p className="muted">loading {filter} issues</p>}
          {result.status === "error" && (
            <p className="error" role="alert">
              list error: {result.message}
            </p>
          )}
          {result.status === "ok" && (
            <ul>
              {shownIssues(store, result.data, result.seq, filter).map(issue => (
                <li key={issue.id} className={issue.id === selected ? "row selected" : "row"}>
                  <button
                    type="button"
                    className="row-main"
                    data-testid="issue"
                    aria-current={issue.id === selected ? "true" : undefined}
                    onClick={() => setSelected(issue.id)}
                  >
                    {`#${issue.id} ${issue.title} (${issue.assignee ?? "unassigned"})`}
                  </button>
                  <button type="button" data-testid="row-assign" disabled={!who} onClick={() => void rowAssign(issue.id)}>
                    {`assign to ${user}`}
                  </button>
                  {filter === "open" && (
                    <button type="button" data-testid="row-close" onClick={() => void rowClose(issue.id)}>
                      close
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="detail" data-testid="detail">
          {selected === null ? (
            <p className="muted">select an issue</p>
          ) : (
            <Detail key={selected} id={selected} user={user} store={store} actions={actions} onOpenHelp={onOpenHelp} />
          )}
        </div>
      </div>
    </section>
  );
}
