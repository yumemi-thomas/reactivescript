import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { type archiveMachine, shownArchived } from "./archiveMachine";

export function ArchivePage({ actor }: { actor: ActorRefFrom<typeof archiveMachine> }) {
  const context = useSelector(actor, s => s.context);
  const state = useSelector(actor, s => (s.matches("loading") ? "loading" : s.matches("failed") ? "failed" : "ready"));
  const rows = shownArchived(context);

  return (
    <main className="archive-page">
      <h2>Archive</h2>
      {context.restoreError !== null && <p className="error">restore error: {context.restoreError}</p>}
      <div data-testid="archived">
        {state === "loading" && <p className="muted">loading archive</p>}
        {state === "failed" && (
          <p className="error">
            archive error: {context.error}{" "}
            <button type="button" onClick={() => actor.send({ type: "retry" })}>retry</button>
          </p>
        )}
        {state === "ready" && (
          <ul className="cards">
            {rows.map(card => (
              <li key={card.id}>
                <span data-testid="archived-card">#{card.id} {card.title}</span>
                <button
                  type="button"
                  data-testid="restore"
                  onClick={() => actor.send({ type: "restore", cardId: card.id })}
                >
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
