import { useMachine } from "@xstate/react";
import { archiveMachine } from "./archiveMachine";

/** The archive page. Like the board, it loads again each time it opens. */
export default function ArchivePage() {
  const [snap, send] = useMachine(archiveMachine);
  const { list, rows, restoreError } = snap.context;
  return (
    <div className="archive">
      <div data-testid="archived">
        {list.status === "loading" && <p>loading archive</p>}
        {list.status === "failed" && <p role="alert">archive error: {list.message}</p>}
        {list.status === "loaded" && (
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <span data-testid="archived-card">
                  #{row.id} {row.title}
                </span>{" "}
                <button type="button" data-testid="restore" onClick={() => send({ type: "RESTORE", id: row.id })}>
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {restoreError && <p role="alert" data-testid="restore-error">{restoreError}</p>}
    </div>
  );
}
