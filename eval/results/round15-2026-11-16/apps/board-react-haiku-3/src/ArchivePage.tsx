import { useEffect, useState } from "react";
import { fetchArchived, restoreCard, type Archived } from "./api.js";
import { messageOf, type Status } from "./model";

interface ArchiveState {
  load: Status;
  items: Archived[];
  restoreError: string | null;
}

export function ArchivePage() {
  const [state, setState] = useState<ArchiveState>({ load: { kind: "loading" }, items: [], restoreError: null });

  useEffect(() => {
    let live = true;
    fetchArchived().then(
      items => {
        if (live) setState({ load: { kind: "ready" }, items, restoreError: null });
      },
      (e: unknown) => {
        if (live) setState(s => ({ ...s, load: { kind: "error", message: messageOf(e) } }));
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const restore = (id: number) => {
    const index = state.items.findIndex(a => a.id === id);
    if (index === -1) return;
    const row = state.items[index];
    setState(s => ({ ...s, items: s.items.filter(a => a.id !== id), restoreError: null }));
    restoreCard(id).catch((e: unknown) => {
      const message = messageOf(e);
      setState(s => {
        const items = s.items.some(a => a.id === id) ? s.items : insertAt(s.items, index, row);
        return { ...s, items, restoreError: `restore error: ${message}` };
      });
    });
  };

  return (
    <div className="archive-page">
      <section data-testid="archived" aria-label="Archived cards">
        {state.load.kind === "loading" && <p className="status">loading archive</p>}
        {state.load.kind === "error" && (
          <p className="error" role="alert">
            {`archive error: ${state.load.message}`}
          </p>
        )}
        {state.load.kind === "ready" && (
          <>
            {state.items.length === 0 && <p className="status">No archived cards.</p>}
            <ul className="items">
              {state.items.map(a => (
                <li key={a.id} className="item-row">
                  <span data-testid="archived-card">{`#${a.id} ${a.title}`}</span>
                  <button type="button" data-testid="restore" onClick={() => restore(a.id)}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {state.restoreError !== null && (
        <p className="error" role="alert" data-testid="restore-error">
          {state.restoreError}
        </p>
      )}
    </div>
  );
}

function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
  const out = list.slice();
  out.splice(Math.max(0, Math.min(index, out.length)), 0, item);
  return out;
}
