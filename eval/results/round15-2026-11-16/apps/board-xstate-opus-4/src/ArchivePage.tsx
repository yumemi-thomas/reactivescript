import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { visibleArchive, type archiveMachine } from "./archiveMachine.js";

export function ArchivePage({ actor }: { actor: ActorRefFrom<typeof archiveMachine> }) {
  const snapshot = useSelector(actor, s => s);
  const { context } = snapshot;
  const rows = visibleArchive(context);

  return (
    <section className="archive-page">
      <h1>Archive</h1>
      {context.restoreError !== null && (
        <p className="error" role="alert" data-testid="restore-error">
          restore error: {context.restoreError}
        </p>
      )}
      <div data-testid="archived" className="archived">
        {snapshot.matches("loading") && <p className="muted">loading archive</p>}
        {snapshot.matches("failed") && (
          <p className="error">
            archive error: {context.loadError}{" "}
            <button type="button" data-testid="retry-archive" onClick={() => actor.send({ type: "retry" })}>
              retry
            </button>
          </p>
        )}
        {snapshot.matches("ready") &&
          (rows.length === 0 ? (
            <p className="muted">nothing archived</p>
          ) : (
            <ul className="rows">
              {rows.map(row => (
                <li key={row.id} className="row">
                  <span data-testid="archived-card">
                    {`#${row.id} ${row.title}`}
                  </span>
                  <button type="button" data-testid="restore" onClick={() => actor.send({ type: "restore", id: row.id })}>
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
