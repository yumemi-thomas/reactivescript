import { useMachine } from "@xstate/react";
import { archiveMachine } from "./archiveMachine";

export default function ArchivePage() {
  const [snapshot, send] = useMachine(archiveMachine);
  const { context } = snapshot;
  const hidden = new Set(context.restoring.map(r => r.id));
  const rows = context.archived.filter(a => !hidden.has(a.id));

  return (
    <div className="archive-page">
      {context.restoreError !== null && (
        <p className="error" role="alert" data-testid="restore-error">
          restore error: {context.restoreError}
        </p>
      )}
      <section className="archived" data-testid="archived" aria-label="Archived cards">
        {snapshot.matches("loading") && <p className="status">loading archive</p>}
        {snapshot.matches("failed") && (
          <div className="status error" role="alert">
            <span>archive error: {context.loadError}</span>{" "}
            <button type="button" data-testid="retry-archive" onClick={() => send({ type: "RETRY" })}>
              retry
            </button>
          </div>
        )}
        {snapshot.matches("ready") &&
          (rows.length === 0 ? (
            <p className="muted">nothing archived</p>
          ) : (
            <ul className="cards">
              {rows.map(a => (
                <li key={a.id} className="card-row">
                  <span className="card" data-testid="archived-card">
                    #{a.id} {a.title}
                  </span>
                  <button
                    type="button"
                    data-testid="restore"
                    aria-label={`restore #${a.id}`}
                    onClick={() => send({ type: "RESTORE", id: a.id })}
                  >
                    restore
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </section>
    </div>
  );
}
