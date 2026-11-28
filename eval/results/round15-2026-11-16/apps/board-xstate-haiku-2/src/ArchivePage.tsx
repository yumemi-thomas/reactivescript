import { useMachine } from "@xstate/react";
import { archiveMachine } from "./archive";

export function ArchivePage() {
  const [snap, send] = useMachine(archiveMachine);
  const ctx = snap.context;
  return (
    <main className="page">
      <div data-testid="archived">
        {snap.matches("loading") && <p className="muted">loading archive</p>}
        {snap.matches("failed") && <p role="alert" className="error">{`archive error: ${ctx.error ?? ""}`}</p>}
        {snap.matches("ready") && (
          <ul className="cards">
            {ctx.rows.map((row) => (
              <li key={row.id} className="card-row">
                <span data-testid="archived-card">{`#${row.id} ${row.title}`}</span>
                <button type="button" onClick={() => send({ type: "restore", id: row.id })}>
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {ctx.restoreError !== null && (
        <p role="alert" className="error" data-testid="restore-error">{`restore error: ${ctx.restoreError}`}</p>
      )}
    </main>
  );
}
