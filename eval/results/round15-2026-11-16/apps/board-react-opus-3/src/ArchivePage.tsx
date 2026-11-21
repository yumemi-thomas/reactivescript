import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import type { Archived } from "./api";
import { errorMessage } from "./boardState";

type ListState = { status: "loading" } | { status: "error"; error: string } | { status: "ok"; cards: Archived[] };

export default function ArchivePage() {
  const [list, setList] = useState<ListState>({ status: "loading" });
  // ids whose restore is in flight: hidden from the list until the server answers
  const [restoring, setRestoring] = useState<ReadonlySet<number>>(() => new Set());
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const request = useRef(0);
  const started = useRef(false);

  // Starts a request; the list is already "loading" on mount, and retry sets it.
  function fetchList() {
    const req = ++request.current;
    api.fetchArchived().then(
      cards => { if (request.current === req) setList({ status: "ok", cards }); },
      (e: unknown) => { if (request.current === req) setList({ status: "error", error: errorMessage(e) }); },
    );
  }

  function retry() {
    setList({ status: "loading" });
    fetchList();
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetchList();
  });

  function without(set: ReadonlySet<number>, id: number): ReadonlySet<number> {
    const next = new Set(set);
    next.delete(id);
    return next;
  }

  function restore(id: number) {
    if (restoring.has(id)) return;
    setRestoreError(null);
    setRestoring(s => new Set(s).add(id));
    api.restoreCard(id).then(
      () => {
        setList(l => (l.status === "ok" ? { ...l, cards: l.cards.filter(c => c.id !== id) } : l));
        setRestoring(s => without(s, id));
      },
      (e: unknown) => {
        setRestoring(s => without(s, id));
        setRestoreError(errorMessage(e));
      },
    );
  }

  return (
    <div className="archive-page">
      <h2>Archive</h2>
      <div data-testid="archived">
        {list.status === "loading" && <p className="muted" role="status">loading archive</p>}
        {list.status === "error" && (
          <p className="error" role="alert">
            <span>archive error: {list.error}</span>{" "}
            <button type="button" data-testid="retry-archive" onClick={retry}>retry</button>
          </p>
        )}
        {list.status === "ok" && (
          <ul className="cards">
            {list.cards.filter(c => !restoring.has(c.id)).map(c => (
              <li key={c.id} className="row">
                <span data-testid="archived-card">#{c.id} {c.title}</span>
                <button type="button" data-testid="restore" onClick={() => restore(c.id)}>restore</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {restoreError !== null && <p className="error" role="alert" data-testid="restore-error">restore error: {restoreError}</p>}
    </div>
  );
}
