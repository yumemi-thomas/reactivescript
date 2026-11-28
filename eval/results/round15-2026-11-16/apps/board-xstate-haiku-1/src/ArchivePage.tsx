import { useMachine } from "@xstate/react";
import { archiveMachine } from "./machines/archive";

/** The archive page. Its machine is created when the page opens and stopped when it closes. */
export default function ArchivePage() {
  const [snapshot, send] = useMachine(archiveMachine);
  const { status, list, message, restoreError } = snapshot.context;
  return (
    <section className="archive-page" data-testid="archived" aria-label="Archived cards">
      {status === "loading" && <p>loading archive</p>}
      {status === "failed" && <p className="error">{`archive error: ${message}`}</p>}
      {status === "loaded" && (
        <ul className="cards">
          {list.map((archived) => (
            <li key={archived.id}>
              <span data-testid="archived-card">{`#${archived.id} ${archived.title}`}</span>
              <button type="button" data-testid="restore" onClick={() => send({ type: "RESTORE", id: archived.id })}>
                restore
              </button>
            </li>
          ))}
        </ul>
      )}
      {restoreError && <p role="alert" className="error">{restoreError}</p>}
    </section>
  );
}
