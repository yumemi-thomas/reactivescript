import { useState } from "react";
import { useActorRef, useSelector } from "@xstate/react";
import { archiveMachine } from "./archiveMachine";

/** The archive page. Mounted when its tab opens, so leaving the tab discards it. */
export function ArchivePage() {
  const actor = useActorRef(archiveMachine);
  const snap = useSelector(actor, (s) => s);
  const { rows, loadError, restoreError } = snap.context;

  return (
    <section className="archive" aria-label="archive">
      {restoreError && <p role="alert" data-testid="restore-error" className="error">{`restore error: ${restoreError}`}</p>}
      <div data-testid="archived">
        {snap.matches("loading") && <p className="muted">loading archive</p>}
        {snap.matches("failed") && (
          <p role="alert" className="error">{`archive error: ${loadError ?? "unknown error"}`}</p>
        )}
        {snap.matches("ready") && (
          <ul className="archived-list">
            {rows.map((row) => (
              <li key={row.id} className="archived-row">
                <span data-testid="archived-card">{`#${row.id} ${row.title}`}</span>
                <button type="button" data-testid="restore" onClick={() => actor.send({ type: "RESTORE", id: row.id })}>
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
