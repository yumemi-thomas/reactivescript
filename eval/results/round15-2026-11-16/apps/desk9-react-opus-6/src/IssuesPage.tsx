import { useEffect, useRef, useState } from "react";
import { assign, closeIssue, fetchIssues, renameIssue } from "./api.js";
import type { Hit, Issue } from "./api.js";
import Detail from "./Detail";
import type { IssueActions } from "./Detail";
import { errorMessage } from "./util";

type Filter = "open" | "closed";

type ListState =
  | { req: number; filter: Filter; status: "ok"; rows: Issue[] }
  | { req: number; filter: Filter; status: "error"; message: string };

type PendingOp =
  | { seq: number; id: number; kind: "assign"; user: string }
  | { seq: number; id: number; kind: "rename"; title: string }
  | { seq: number; id: number; kind: "close" };

type Handlers<T> = { onOk?: (res: T) => void; onFail?: (message: string) => void };

/** The list as it should look: the server's rows with every change still in flight applied, oldest first. */
function applyOps(rows: Issue[], ops: PendingOp[], filter: Filter): Issue[] {
  let out = rows;
  for (const op of ops) {
    if (op.kind === "assign") out = out.map(r => (r.id === op.id ? { ...r, assignee: op.user } : r));
    else if (op.kind === "rename") out = out.map(r => (r.id === op.id ? { ...r, title: op.title } : r));
    else if (filter === "open") out = out.filter(r => r.id !== op.id);
  }
  return out;
}

type Props = {
  onOpenCount: (n: number) => void;
  onOpenRelated: (query: string, hit: Hit) => void;
};

export default function IssuesPage({ onOpenCount, onOpenRelated }: Props) {
  const [user, setUser] = useState("guest");
  const [filter, setFilter] = useState<Filter>("open");
  const [listReq, setListReq] = useState(0);
  const [list, setList] = useState<ListState | null>(null);
  const [ops, setOps] = useState<PendingOp[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const confirmedRef = useRef(new Map<string, number>());

  useEffect(() => {
    let alive = true;
    fetchIssues(filter).then(
      rows => {
        if (alive) setList({ req: listReq, filter, status: "ok", rows });
      },
      e => {
        if (alive) setList({ req: listReq, filter, status: "error", message: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [filter, listReq]);

  const current = list !== null && list.req === listReq ? list : null;
  const rows = current?.status === "ok" ? applyOps(current.rows, ops, current.filter) : null;
  const openCount = current?.status === "ok" && current.filter === "open" && rows ? rows.length : null;

  useEffect(() => {
    if (openCount !== null) onOpenCount(openCount);
  }, [openCount, onOpenCount]);

  const changeFilter = (f: Filter) => {
    if (f === filter) return;
    setFilter(f);
    setListReq(r => r + 1);
  };

  /** Runs a change optimistically: it shows at once, and the server's rows only take it when the server accepts. */
  function track<T>(
    op: PendingOp,
    promise: Promise<T>,
    onServer: (rows: Issue[], res: T, listFilter: Filter) => Issue[],
    h: Handlers<T>,
  ) {
    setOps(o => [...o, op]);
    promise.then(
      res => {
        setOps(o => o.filter(x => x.seq !== op.seq));
        const key = `${op.kind}:${op.id}`;
        // Answers can come back out of order: only the latest change of a kind to an issue decides its value.
        if (op.seq <= (confirmedRef.current.get(key) ?? 0)) return;
        confirmedRef.current.set(key, op.seq);
        setList(l => (l && l.status === "ok" ? { ...l, rows: onServer(l.rows, res, l.filter) } : l));
        h.onOk?.(res);
      },
      e => {
        setOps(o => o.filter(x => x.seq !== op.seq));
        h.onFail?.(errorMessage(e));
      },
    );
  }

  const doAssign = (id: number, who: string, h: Handlers<{ id: number; assignee: string }>) => {
    const seq = ++seqRef.current;
    track(
      { seq, id, kind: "assign", user: who },
      assign(id, who),
      (rs, res) => rs.map(r => (r.id === id ? { ...r, assignee: res.assignee } : r)),
      h,
    );
  };

  const doRename = (id: number, title: string, h: Handlers<{ id: number; title: string }>) => {
    const seq = ++seqRef.current;
    track(
      { seq, id, kind: "rename", title },
      renameIssue(id, title),
      (rs, res) => rs.map(r => (r.id === id ? { ...r, title: res.title } : r)),
      h,
    );
  };

  const doClose = (id: number, h: Handlers<{ id: number }>) => {
    const seq = ++seqRef.current;
    track(
      { seq, id, kind: "close" },
      closeIssue(id),
      (rs, _res, listFilter) => (listFilter === "open" ? rs.filter(r => r.id !== id) : rs),
      h,
    );
  };

  const actions: IssueActions = {
    assign: (id, who, onFail) => doAssign(id, who, { onFail }),
    rename: (id, title, onOk, onFail) => doRename(id, title, { onOk: res => onOk(res.title), onFail }),
    close: (id, onFail) => doClose(id, { onFail }),
  };

  const rowFail = (message: string) => setRowError(`row error: ${message}`);

  const rowAssign = (id: number) => {
    const who = user.trim();
    if (!who) return;
    setRowError(null);
    doAssign(id, who, { onFail: rowFail });
  };

  const rowClose = (id: number) => {
    setRowError(null);
    doClose(id, { onFail: rowFail });
  };

  let pendingTitle: string | null = null;
  for (const op of ops) if (op.kind === "rename" && op.id === selectedId) pendingTitle = op.title;

  const shownFilter = current?.filter ?? filter;

  return (
    <div>
      <div className="toolbar">
        <label>
          Current user{" "}
          <input data-testid="user" value={user} onChange={e => setUser(e.target.value)} aria-label="Current user" />
        </label>
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
      {rowError !== null && (
        <p className="error" role="alert" data-testid="row-error">
          {rowError}
        </p>
      )}
      <div className="issues">
        <div data-testid="list">
          {current === null ? (
            <p className="muted">loading {filter} issues</p>
          ) : current.status === "error" ? (
            <p className="error">list error: {current.message}</p>
          ) : (
            <ul className="rows">
              {rows!.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={r.id === selectedId ? "row-main selected" : "row-main"}
                    data-testid="issue"
                    onClick={() => setSelectedId(r.id)}
                  >
                    #{r.id} {r.title} ({r.assignee ?? "unassigned"})
                  </button>
                  <button type="button" data-testid="row-assign" onClick={() => rowAssign(r.id)}>
                    assign to {user}
                  </button>
                  {shownFilter === "open" && (
                    <button type="button" data-testid="row-close" onClick={() => rowClose(r.id)}>
                      close
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel" data-testid="detail">
          {selectedId === null ? (
            <p className="muted">select an issue</p>
          ) : (
            <Detail
              key={selectedId}
              id={selectedId}
              user={user}
              pendingTitle={pendingTitle}
              actions={actions}
              onOpenRelated={onOpenRelated}
            />
          )}
        </div>
      </div>
    </div>
  );
}
