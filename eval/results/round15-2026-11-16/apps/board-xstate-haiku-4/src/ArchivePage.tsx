import { useMachine } from "@xstate/react";
import { archiveMachine } from "./archiveMachine";

export function ArchivePage() {
  const [snap, send] = useMachine(archiveMachine);
  const { archived, loadError, restoreError } = snap.context;
  return (
    <section>
      <div data-testid="archived">
        {snap.matches("loading") && <p>loading archive</p>}
        {snap.matches("failed") && <p>{`archive error: ${loadError}`}</p>}
        {snap.matches("loaded") && (
          <ul>
            {archived.map((row) => (
              <li key={row.id}>
                <span data-testid="archived-card">{`#${row.id} ${row.title}`}</span>{" "}
                <button type="button" data-testid="restore" onClick={() => send({ type: "restore", id: row.id })}>
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {restoreError && <p data-testid="restore-error">{restoreError}</p>}
    </section>
  );
}
