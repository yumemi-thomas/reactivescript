import { useEffect, useState } from "react";
import { fetchArchived, restoreCard } from "./api.js";
import type { Archived } from "./api.js";
import { errorMessage } from "./boardState";

type ArchiveState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; list: Archived[] };

export default function ArchivePage() {
  const [state, setState] = useState<ArchiveState>({ status: "loading" });
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchArchived().then(
      list => {
        if (active) setState({ status: "ok", list });
      },
      error => {
        if (active) setState({ status: "error", message: errorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const restore = (row: Archived, index: number) => {
    setRestoreError(null);
    setState(prev => (prev.status === "ok" ? { status: "ok", list: prev.list.filter(a => a.id !== row.id) } : prev));
    restoreCard(row.id).catch(error => {
      setState(prev => {
        if (prev.status !== "ok") return prev;
        const list = [...prev.list];
        list.splice(Math.min(index, list.length), 0, row);
        return { status: "ok", list };
      });
      setRestoreError(`restore error: ${errorMessage(error)}`);
    });
  };

  return (
    <section className="archive-page" aria-label="Archive">
      <h2>Archive</h2>
      <div data-testid="archived">
        {state.status === "loading" && <p className="muted">loading archive</p>}
        {state.status === "error" && (
          <p role="alert" className="error">
            {`archive error: ${state.message}`}
          </p>
        )}
        {state.status === "ok" && (
          <ul className="list-plain">
            {state.list.map((row, index) => (
              <li key={row.id} className="archived-row">
                <span data-testid="archived-card">{`#${row.id} ${row.title}`}</span>
                <button type="button" data-testid="restore" onClick={() => restore(row, index)}>
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {restoreError && (
        <p role="alert" className="error" data-testid="restore-error">
          {restoreError}
        </p>
      )}
    </section>
  );
}
