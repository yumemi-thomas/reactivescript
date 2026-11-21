import { useEffect, useState } from "react";
import { assign, closeIssue, fetchIssues, renameIssue } from "./api";
import type { Hit, Issue } from "./api";
import { applyOps, overlay } from "./issueOps";
import type { ConfirmedOp, IssueOp } from "./issueOps";
import IssueDetail from "./IssueDetail";
import { errMsg, nextSeq } from "./util";

type Filter = "open" | "closed";

type ListState =
  | { status: "ok"; startedAt: number; rows: Issue[] }
  | { status: "error"; startedAt: number; error: string };

export type OpenHelp = (query: string, hits: Hit[], hit: Hit) => void;

type Props = {
  onCount: (n: number) => void;
  onOpenHelp: OpenHelp;
};

export default function IssuesPage({ onCount, onOpenHelp }: Props) {
  const [user, setUser] = useState("guest");
  const [filter, setFilter] = useState<Filter>("open");
  // null while the list for the current filter loads
  const [list, setList] = useState<ListState | null>(null);
  const [pending, setPending] = useState<IssueOp[]>([]);
  const [confirmed, setConfirmed] = useState<ConfirmedOp[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const startedAt = nextSeq();
    fetchIssues(filter).then(
      rows => {
        if (live) setList({ status: "ok", startedAt, rows });
      },
      (e: unknown) => {
        if (live) setList({ status: "error", startedAt, error: errMsg(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [filter]);

  const rows =
    list?.status === "ok" ? applyOps(list.rows, overlay(pending, confirmed, list.startedAt), filter === "open") : null;
  const openCount = filter === "open" && rows ? rows.length : null;

  useEffect(() => {
    if (openCount !== null) onCount(openCount);
  }, [openCount, onCount]);

  function switchFilter(f: Filter) {
    if (f === filter) return;
    setFilter(f);
    setList(null);
  }

  function select(id: number) {
    if (id !== selectedId) setSelectedId(id);
  }

  const runOp = (op: IssueOp): Promise<void> => {
    setPending(p => [...p, op]);
    const call: Promise<IssueOp> =
      op.kind === "assign"
        ? assign(op.id, op.user).then(r => ({ ...op, user: r.assignee }))
        : op.kind === "rename"
          ? renameIssue(op.id, op.title).then(r => ({ ...op, title: r.title }))
          : closeIssue(op.id).then(() => op);
    return call.then(
      done => {
        const at = nextSeq();
        setConfirmed(c => [...c, { ...done, at }]);
        setPending(p => p.filter(o => o.seq !== op.seq));
      },
      (e: unknown) => {
        setPending(p => p.filter(o => o.seq !== op.seq));
        throw e;
      },
    );
  };

  function rowAction(op: IssueOp) {
    setRowError(null);
    runOp(op).catch((e: unknown) => setRowError(`row error: ${errMsg(e)}`));
  }

  const closing = (id: number) => pending.some(o => o.kind === "close" && o.id === id);

  return (
    <div className="issues">
      <div className="toolbar">
        <label>
          Current user{" "}
          <input data-testid="user" value={user} onChange={e => setUser(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Filter">
          <button
            type="button"
            data-testid="filter-open"
            aria-pressed={filter === "open"}
            onClick={() => switchFilter("open")}
          >
            open
          </button>
          <button
            type="button"
            data-testid="filter-closed"
            aria-pressed={filter === "closed"}
            onClick={() => switchFilter("closed")}
          >
            closed
          </button>
        </div>
      </div>
      {rowError !== null && (
        <p className="error" role="alert" data-testid="row-error">
          {rowError}
        </p>
      )}
      <div className="columns">
        <div data-testid="list" className="list" aria-busy={list === null}>
          {list === null ? (
            <p className="muted">{`loading ${filter} issues`}</p>
          ) : list.status === "error" ? (
            <p className="error" role="alert">{`list error: ${list.error}`}</p>
          ) : rows && rows.length === 0 ? (
            <p className="muted">{`no ${filter} issues`}</p>
          ) : (
            <ul>
              {rows?.map(r => (
                <li key={r.id} className={r.id === selectedId ? "selected" : undefined}>
                  <button
                    type="button"
                    className="row"
                    data-testid="issue"
                    aria-current={r.id === selectedId ? "true" : undefined}
                    onClick={() => select(r.id)}
                  >
                    {`#${r.id} ${r.title} (${r.assignee ?? "unassigned"})`}
                  </button>
                  <button
                    type="button"
                    data-testid="row-assign"
                    disabled={user.trim() === ""}
                    onClick={() => rowAction({ seq: nextSeq(), id: r.id, kind: "assign", user })}
                  >
                    {`assign to ${user}`}
                  </button>
                  {filter === "open" && (
                    <button
                      type="button"
                      data-testid="row-close"
                      disabled={closing(r.id)}
                      onClick={() => rowAction({ seq: nextSeq(), id: r.id, kind: "close" })}
                    >
                      close
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div data-testid="detail" className="detail">
          {selectedId === null ? (
            <p className="muted">select an issue</p>
          ) : (
            <IssueDetail
              key={selectedId}
              id={selectedId}
              user={user}
              pending={pending}
              confirmed={confirmed}
              runOp={runOp}
              closing={closing(selectedId)}
              onOpenHelp={onOpenHelp}
            />
          )}
        </div>
      </div>
    </div>
  );
}
