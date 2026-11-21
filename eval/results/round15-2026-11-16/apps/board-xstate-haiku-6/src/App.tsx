import { useMachine } from "@xstate/react";
import ArchivePage from "./ArchivePage";
import BoardPage from "./BoardPage";
import { appMachine } from "./appMachine";

export default function App() {
  const [snap, send] = useMachine(appMachine);
  const onBoard = snap.matches("board");

  return (
    <main className="app">
      <header className="tabs">
        <h1>Sprint board</h1>
        <nav>
          <button
            data-testid="tab-board"
            aria-current={onBoard ? "page" : undefined}
            onClick={() => send({ type: "tab.board" })}
          >
            Board
          </button>
          <button
            data-testid="tab-archive"
            aria-current={onBoard ? undefined : "page"}
            onClick={() => send({ type: "tab.archive" })}
          >
            Archive
          </button>
        </nav>
      </header>
      {onBoard ? <BoardPage /> : <ArchivePage />}
    </main>
  );
}
