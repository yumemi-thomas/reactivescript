import { useEffect, useState } from "react";
import { fetchArchived, restoreCard, type Archived } from "../api.js";
import { messageOf } from "../errors";

type View =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: Archived[]; restoreError: string | null };

export function ArchivePage() {
  const [view, setView] = useState<View>({ status: "loading" });

  useEffect(() => {
    let live = true;
    fetchArchived().then(
      items => {
        if (live) setView({ status: "ready", items, restoreError: null });
      },
      err => {
        if (live) setView({ status: "error", message: messageOf(err) });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  function restore(row: Archived, index: number) {
    setView(v => (v.status === "ready" ? { ...v, items: v.items.filter(r => r.id !== row.id), restoreError: null } : v));
    restoreCard(row.id).catch(err =>
      setView(v => {
        if (v.status !== "ready") return v;
        const items = v.items.some(r => r.id === row.id)
          ? v.items
          : [...v.items.slice(0, index), row, ...v.items.slice(index)];
        return { ...v, items, restoreError: messageOf(err) };
      }),
    );
  }

  return (
    <section className="archive-page">
      <h2>Archive</h2>
      <div data-testid="archived" className="archived">
        {view.status === "loading" && <p className="muted">loading archive</p>}
        {view.status === "error" && <p className="error">{`archive error: ${view.message}`}</p>}
        {view.status === "ready" &&
          (view.items.length === 0 ? (
            <p className="muted">nothing archived</p>
          ) : (
            <ul>
              {view.items.map((row, index) => (
                <li className="row" key={row.id}>
                  <span data-testid="archived-card">{`#${row.id} ${row.title}`}</span>
                  <button type="button" data-testid="restore" onClick={() => restore(row, index)}>
                    restore
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
      {view.status === "ready" && view.restoreError !== null && (
        <p className="error">{`restore error: ${view.restoreError}`}</p>
      )}
    </section>
  );
}
