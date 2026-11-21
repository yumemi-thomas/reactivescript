import { useCallback, useEffect, useRef, useState } from "react";
import { assign, closeIssue, fetchIssues, renameIssue } from "./api.js";
import type { Issue } from "./api.js";
import IssueDetail, { type Ops } from "./IssueDetail";
import { errorMessage, type Load } from "./load";

type Filter = "open" | "closed";

// Optimistic edits layered over the server's list. `undefined` means "no edit".
type Edit = { title?: string; assignee?: string | null; closed?: boolean };
type Overlay = Record<number, Edit | undefined>;

type ListState = { filter: Filter; load: Load<Issue[]> };

type Props = {
  onOpenCount: (count: number) => void;
  onOpenHelp: (query: string, hitId: number) => void;
};

function withEdit(overlay: Overlay, id: number, edit: Edit): Overlay {
  return { ...overlay, [id]: { ...overlay[id], ...edit } };
}

function viewIssue(issue: Issue, overlay: Overlay): Issue {
  const edit = overlay[issue.id];
  return {
    id: issue.id,
    title: edit?.title ?? issue.title,
    assignee: edit && edit.assignee !== undefined ? edit.assignee : issue.assignee,
  };
}

export default function IssuesPage({ onOpenCount, onOpenHelp }: Props) {
  const [user, setUser] = useState("guest");
  const [list, setList] = useState<ListState>({ filter: "open", load: { status: "loading" } });
  const [overlay, setOverlay] = useState<Overlay>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const listToken = useRef(0);

  const requestList = useCallback((filter: Filter) => {
    const mine = ++listToken.current;
    fetchIssues(filter).then(
      (value) => {
        if (mine === listToken.current) setList({ filter, load: { status: "ok", value } });
      },
      (e: unknown) => {
        if (mine === listToken.current) setList({ filter, load: { status: "error", message: errorMessage(e) } });
      },
    );
  }, []);

  useEffect(() => {
    requestList("open");
  }, [requestList]);

  const filter = list.filter;

  function switchFilter(next: Filter) {
    if (next === filter && list.load.status !== "error") return;
    setList({ filter: next, load: { status: "loading" } });
    requestList(next);
  }

  // Each action applies its change at once, and on refusal restores exactly
  // the overlay value it replaced. It returns the refusal message, or null.
  async function doAssign(id: number, next: string): Promise<string | null> {
    const before = overlay[id]?.assignee;
    setOverlay((o) => withEdit(o, id, { assignee: next }));
    try {
      await assign(id, next);
      return null;
    } catch (e) {
      setOverlay((o) => withEdit(o, id, { assignee: before }));
      return errorMessage(e);
    }
  }

  async function doRename(id: number, title: string): Promise<string | null> {
    const before = overlay[id]?.title;
    setOverlay((o) => withEdit(o, id, { title }));
    try {
      await renameIssue(id, title);
      return null;
    } catch (e) {
      setOverlay((o) => withEdit(o, id, { title: before }));
      return errorMessage(e);
    }
  }

  async function doClose(id: number): Promise<string | null> {
    const before = overlay[id]?.closed;
    setOverlay((o) => withEdit(o, id, { closed: true }));
    try {
      await closeIssue(id);
      return null;
    } catch (e) {
      setOverlay((o) => withEdit(o, id, { closed: before }));
      return errorMessage(e);
    }
  }

  const ops: Ops = { assign: doAssign, rename: doRename, close: doClose };

  async function rowAssign(id: number) {
    setRowError(null);
    setRowError(await doAssign(id, user));
  }

  async function rowClose(id: number) {
    setRowError(null);
    setRowError(await doClose(id));
  }

  const rows =
    list.load.status === "ok"
      ? list.load.value
          .map((issue) => viewIssue(issue, overlay))
          .filter((issue) => filter === "closed" || overlay[issue.id]?.closed !== true)
      : [];

  // The tab count follows the open list as it is shown, and holds while the
  // closed list is shown, while loading, or after a failure.
  const openCount = filter === "open" && list.load.status === "ok" ? rows.length : null;
  useEffect(() => {
    if (openCount !== null) onOpenCount(openCount);
  }, [openCount, onOpenCount]);

  return (
    <div className="issues">
      <div className="toolbar">
        <label>
          Current user{" "}
          <input data-testid="user" value={user} onChange={(e) => setUser(e.target.value)} />
        </label>
        <div role="group" aria-label="Filter">
          <button data-testid="filter-open" aria-pressed={filter === "open"} onClick={() => switchFilter("open")}>
            Open
          </button>
          <button data-testid="filter-closed" aria-pressed={filter === "closed"} onClick={() => switchFilter("closed")}>
            Closed
          </button>
        </div>
      </div>

      <div className="columns">
        <section data-testid="list" aria-label="Issues" aria-live="polite">
          {list.load.status === "loading" && <p>loading {filter} issues</p>}
          {list.load.status === "error" && <p role="alert">list error: {list.load.message}</p>}
          {list.load.status === "ok" && rows.length === 0 && <p>no {filter} issues</p>}
          <ul>
            {rows.map((issue) => (
              <li key={issue.id}>
                <button
                  data-testid="issue"
                  aria-current={selectedId === issue.id}
                  onClick={() => setSelectedId(issue.id)}
                >
                  #{issue.id} {issue.title} ({issue.assignee ?? "unassigned"})
                </button>
                <button data-testid="row-assign" onClick={() => void rowAssign(issue.id)}>
                  assign to {user}
                </button>
                {filter === "open" && (
                  <button data-testid="row-close" onClick={() => void rowClose(issue.id)}>
                    close
                  </button>
                )}
              </li>
            ))}
          </ul>
          {rowError !== null && <p data-testid="row-error" role="alert">row error: {rowError}</p>}
        </section>

        <section data-testid="detail" aria-label="Issue detail">
          {selectedId === null ? (
            "select an issue"
          ) : (
            <IssueDetail
              key={selectedId}
              id={selectedId}
              user={user}
              titleOverride={overlay[selectedId]?.title}
              ops={ops}
              onOpenHelp={onOpenHelp}
            />
          )}
        </section>
      </div>
    </div>
  );
}
