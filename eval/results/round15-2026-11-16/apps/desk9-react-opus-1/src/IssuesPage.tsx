import { useEffect, useRef, useState } from "react";
import { assign, closeIssue, fetchIssues, renameIssue, type Issue } from "./api.js";
import { errMsg, nextSeq } from "./util";
import IssueDetail from "./IssueDetail";
import type { HelpSeed } from "./HelpPage";

type Filter = "open" | "closed";

type Op = { seq: number; id: number } & (
  | { kind: "assign"; user: string }
  | { kind: "rename"; title: string }
  | { kind: "close" }
);

type ListState =
  | { gen: number; filter: Filter; status: "ok"; issues: Issue[] }
  | { gen: number; filter: Filter; status: "error"; error: string };

type Props = {
  onOpenCount: (n: number) => void;
  onOpenHelp: (seed: HelpSeed) => void;
};

function latest<K extends Op["kind"]>(ops: Op[], id: number, kind: K): Extract<Op, { kind: K }> | undefined {
  let found: Extract<Op, { kind: K }> | undefined;
  for (const op of ops) {
    if (op.id === id && op.kind === kind && (!found || op.seq > found.seq)) found = op as Extract<Op, { kind: K }>;
  }
  return found;
}

export default function IssuesPage({ onOpenCount, onOpenHelp }: Props) {
  const [user, setUser] = useState("guest");
  const [filter, setFilter] = useState<Filter>("open");
  const [gen, setGen] = useState(0);
  const [list, setList] = useState<ListState | null>(null);
  const [ops, setOps] = useState<Op[]>([]);
  const [closedIds, setClosedIds] = useState<ReadonlySet<number>>(() => new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // the newest request whose answer has been folded into the list, per action and issue
  const applied = useRef(new Map<string, number>());

  useEffect(() => {
    let live = true;
    fetchIssues(filter).then(
      issues => {
        if (live) setList({ gen, filter, status: "ok", issues });
      },
      (e: unknown) => {
        if (live) setList({ gen, filter, status: "error", error: errMsg(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [filter, gen]);

  const loading = list === null || list.gen !== gen;
  const shownFilter: Filter = filter;

  let rows: Issue[] = [];
  if (!loading && list.status === "ok") {
    rows = list.issues
      .filter(i => !(list.filter === "open" && (closedIds.has(i.id) || latest(ops, i.id, "close"))))
      .map(i => {
        const a = latest(ops, i.id, "assign");
        const r = latest(ops, i.id, "rename");
        return { ...i, assignee: a ? a.user : i.assignee, title: r ? r.title : i.title };
      });
  }
  const openCount = !loading && list.status === "ok" && list.filter === "open" ? rows.length : null;

  useEffect(() => {
    if (openCount !== null) onOpenCount(openCount);
  }, [openCount, onOpenCount]);

  function changeFilter(f: Filter) {
    if (f === filter) return;
    setFilter(f);
    setGen(g => g + 1);
  }

  function mutateList(fn: (l: ListState) => ListState) {
    setList(l => (l === null ? l : fn(l)));
  }

  /** applies `op` optimistically; rejects (after rolling back) when the server declines */
  function run<R>(op: Op, call: () => Promise<R>, fold: (r: R) => void): Promise<void> {
    setOps(o => [...o, op]);
    const drop = () => setOps(o => o.filter(x => x !== op));
    return call().then(
      r => {
        const k = `${op.kind}:${op.id}`;
        if ((applied.current.get(k) ?? 0) < op.seq) {
          applied.current.set(k, op.seq);
          fold(r);
        }
        drop();
      },
      (e: unknown) => {
        drop();
        throw e;
      },
    );
  }

  function doAssign(id: number, who: string): Promise<void> {
    return run({ seq: nextSeq(), id, kind: "assign", user: who }, () => assign(id, who), r =>
      mutateList(l =>
        l.status === "ok"
          ? { ...l, issues: l.issues.map(i => (i.id === id ? { ...i, assignee: r.assignee } : i)) }
          : l,
      ),
    );
  }

  function doRename(id: number, title: string): Promise<void> {
    return run({ seq: nextSeq(), id, kind: "rename", title }, () => renameIssue(id, title), r =>
      mutateList(l =>
        l.status === "ok" ? { ...l, issues: l.issues.map(i => (i.id === id ? { ...i, title: r.title } : i)) } : l,
      ),
    );
  }

  function doClose(id: number): Promise<void> {
    return run({ seq: nextSeq(), id, kind: "close" }, () => closeIssue(id), () => {
      setClosedIds(s => new Set(s).add(id));
      mutateList(l =>
        l.status === "ok" && l.filter === "open" ? { ...l, issues: l.issues.filter(i => i.id !== id) } : l,
      );
    });
  }

  function rowAction(p: () => Promise<void>) {
    setRowError(null);
    p().catch((e: unknown) => setRowError(`row error: ${errMsg(e)}`));
  }

  const pendingTitle = selected === null ? undefined : latest(ops, selected, "rename")?.title;

  return (
    <section className="issues">
      <div className="toolbar">
        <label>
          User{" "}
          <input data-testid="user" value={user} onChange={e => setUser(e.target.value)} />
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
      <div className="columns">
        <div data-testid="list" className="list">
          {loading ? (
            <p>{`loading ${shownFilter} issues`}</p>
          ) : list.status === "error" ? (
            <p className="error">{`list error: ${list.error}`}</p>
          ) : (
            <ul>
              {rows.map(i => (
                <li key={i.id} className={i.id === selected ? "row selected" : "row"}>
                  <span
                    data-testid="issue"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(i.id)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(i.id);
                      }
                    }}
                  >
                    {`#${i.id} ${i.title} (${i.assignee ?? "unassigned"})`}
                  </span>{" "}
                  <button type="button" data-testid="row-assign" onClick={() => rowAction(() => doAssign(i.id, user))}>
                    {`assign to ${user}`}
                  </button>
                  {list.filter === "open" && (
                    <button type="button" data-testid="row-close" onClick={() => rowAction(() => doClose(i.id))}>
                      close
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div data-testid="detail" className="detail">
          {selected === null ? (
            <p>select an issue</p>
          ) : (
            <IssueDetail
              key={selected}
              id={selected}
              user={user}
              pendingTitle={pendingTitle}
              onAssign={doAssign}
              onRename={doRename}
              onClose={doClose}
              onOpenHelp={onOpenHelp}
            />
          )}
        </div>
      </div>
    </section>
  );
}
