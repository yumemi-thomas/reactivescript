import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { archiveMachine } from "./archiveMachine";

export function ArchivePage({ actor }: { actor: ActorRefFrom<typeof archiveMachine> }) {
  const snapshot = useSelector(actor, s => s);
  const { cards, restoring, loadError, restoreError } = snapshot.context;
  const rows = cards.filter(c => !restoring.includes(c.id));

  return (
    <section className="archive-page">
      <h2>Archive</h2>
      {restoreError && (
        <p className="error" role="alert" data-testid="restore-error">
          {restoreError}
        </p>
      )}
      <div data-testid="archived">
        {snapshot.matches("loading") && <p className="muted">loading archive</p>}
        {snapshot.matches("failed") && (
          <p className="error" role="alert">
            archive error: {loadError}{" "}
            <button type="button" data-testid="retry-archive" onClick={() => actor.send({ type: "retry" })}>
              retry
            </button>
          </p>
        )}
        {snapshot.matches("ready") && (
          <ul className="list">
            {rows.length === 0 && <li className="muted">nothing archived</li>}
            {rows.map(c => (
              <li key={c.id} className="row">
                <span data-testid="archived-card">{`#${c.id} ${c.title}`}</span>
                <button type="button" data-testid="restore" onClick={() => actor.send({ type: "restore", id: c.id })}>
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
