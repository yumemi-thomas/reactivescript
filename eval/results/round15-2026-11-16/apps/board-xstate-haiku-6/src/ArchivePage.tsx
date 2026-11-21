import { useMachine } from "@xstate/react";
import { archiveMachine } from "./archiveMachine";

export default function ArchivePage() {
  const [snap, send] = useMachine(archiveMachine);
  const ctx = snap.context;

  return (
    <section className="page">
      <section data-testid="archived">
        {snap.matches("loading") && <p>loading archive</p>}
        {snap.matches("failed") && <p className="error">{`archive error: ${ctx.loadError}`}</p>}
        {snap.matches("loaded") && (
          <ul>
            {ctx.archived.map((row) => (
              <li key={row.id} className="card-row">
                <span data-testid="archived-card">{`#${row.id} ${row.title}`}</span>
                <button data-testid="restore" onClick={() => send({ type: "restore", id: row.id })}>restore</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {ctx.restoreError && <p className="error" data-testid="restore-error">{ctx.restoreError}</p>}
    </section>
  );
}
