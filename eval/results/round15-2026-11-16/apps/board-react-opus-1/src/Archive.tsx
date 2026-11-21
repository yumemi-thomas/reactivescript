import { useCallback, useEffect, useRef, useState } from "react";
import { fetchArchived, restoreCard, type Archived } from "./api.js";
import { errorMessage, useRebased } from "./rebase";

type ListState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; cards: Archived[] };
type Op = { kind: "restore"; id: number };

function applyOp(s: ListState, op: Op): ListState {
  if (s.status !== "ok") return s;
  return { status: "ok", cards: s.cards.filter(c => c.id !== op.id) };
}
const init = (): ListState => ({ status: "loading" });

export default function Archive() {
  const { view, setBase, run } = useRebased(applyOp, init);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(() => {
    fetchArchived().then(
      cards => setBase(() => ({ status: "ok", cards })),
      (e: unknown) => setBase(() => ({ status: "error", message: errorMessage(e) })),
    );
  }, [setBase]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    load();
  }, [load]);

  function retry() {
    setBase(() => ({ status: "loading" }));
    load();
  }

  function restore(id: number) {
    setRestoreError(null);
    const op: Op = { kind: "restore", id };
    run(op, () => restoreCard(id), () => op).catch((e: unknown) => setRestoreError(errorMessage(e)));
  }

  return (
    <section className="archive" aria-label="Archive">
      <h2>Archived cards</h2>
      {restoreError !== null && (
        <p className="error" role="alert" data-testid="restore-error">
          restore error: {restoreError}
        </p>
      )}
      <div data-testid="archived">
        {view.status === "loading" && <p className="muted">loading archive</p>}
        {view.status === "error" && (
          <p className="error" role="alert">
            archive error: {view.message}{" "}
            <button type="button" className="small" data-testid="retry-archive" onClick={retry}>
              retry
            </button>
          </p>
        )}
        {view.status === "ok" &&
          (view.cards.length === 0 ? (
            <p className="muted">nothing archived</p>
          ) : (
            <ul className="archived">
              {view.cards.map(c => (
                <li key={c.id}>
                  <span data-testid="archived-card">{`#${c.id} ${c.title}`}</span>
                  <button type="button" className="small" data-testid="restore" onClick={() => restore(c.id)}>
                    restore
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </section>
  );
}
