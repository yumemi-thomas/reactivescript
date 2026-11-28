import { useMachine } from "@xstate/react";
import { setup } from "xstate";
import { ArchivePage } from "./ArchivePage";
import { BoardPage } from "./BoardPage";
import "./App.css";

/** Which page is open. Each page is a separate machine, so leaving one discards it. */
const appSetup = setup({
  types: { events: {} as { type: "showBoard" } | { type: "showArchive" } },
});

const appMachine = appSetup.createMachine({
  id: "app",
  initial: "board",
  states: {
    board: { on: { showArchive: { target: "archive" } } },
    archive: { on: { showBoard: { target: "board" } } },
  },
});

export default function App() {
  const [snap, send] = useMachine(appMachine);
  const onBoard = snap.matches("board");
  return (
    <div className="app">
      <header className="app-header">
        <h1>Sprint board</h1>
        <nav className="tabs" aria-label="Pages">
          <button
            type="button"
            data-testid="tab-board"
            aria-pressed={onBoard}
            onClick={() => send({ type: "showBoard" })}
          >
            Board
          </button>
          <button
            type="button"
            data-testid="tab-archive"
            aria-pressed={!onBoard}
            onClick={() => send({ type: "showArchive" })}
          >
            Archive
          </button>
        </nav>
      </header>
      {onBoard ? <BoardPage /> : <ArchivePage />}
    </div>
  );
}
