import { useMachine } from "@xstate/react";
import { appMachine } from "./appMachine";
import { ArchivePage } from "./archive/ArchivePage";
import { BoardPage } from "./board/BoardPage";
import "./styles.css";

export default function App() {
  const [snapshot, send] = useMachine(appMachine);
  const board = snapshot.children.board;
  const archive = snapshot.children.archive;
  const page = snapshot.matches("archive") ? "archive" : "board";

  return (
    <div className="app">
      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="tab-board"
          aria-selected={page === "board"}
          className={page === "board" ? "tab active" : "tab"}
          onClick={() => send({ type: "open", page: "board" })}
        >
          Board
        </button>
        <button
          type="button"
          role="tab"
          data-testid="tab-archive"
          aria-selected={page === "archive"}
          className={page === "archive" ? "tab active" : "tab"}
          onClick={() => send({ type: "open", page: "archive" })}
        >
          Archive
        </button>
      </nav>
      <main>
        {page === "board" && board && <BoardPage key={board.id + board.sessionId} actor={board} />}
        {page === "archive" && archive && <ArchivePage key={archive.id + archive.sessionId} actor={archive} />}
      </main>
    </div>
  );
}
