import { useMachine } from "@xstate/react";
import { ArchivePage } from "./ArchivePage";
import { BoardPage } from "./BoardPage";
import { appMachine } from "./appMachine";

export default function App() {
  const [snap, send] = useMachine(appMachine);
  const onBoard = snap.matches("board");
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem" }}>Sprint board</h1>
      <nav style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" data-testid="tab-board" aria-pressed={onBoard} onClick={() => send({ type: "GO_BOARD" })}>
          Board
        </button>
        <button
          type="button"
          data-testid="tab-archive"
          aria-pressed={!onBoard}
          onClick={() => send({ type: "GO_ARCHIVE" })}
        >
          Archive
        </button>
      </nav>
      {onBoard ? <BoardPage /> : <ArchivePage />}
    </div>
  );
}
