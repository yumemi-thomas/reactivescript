import { useMachine } from "@xstate/react";
import ArchivePage from "./ArchivePage";
import BoardPage from "./BoardPage";
import { tabsMachine } from "./machines/tabs";
import "./app.css";

export default function App() {
  const [snapshot, send] = useMachine(tabsMachine);
  const onArchive = snapshot.matches("archive");
  return (
    <div className="app">
      <header>
        <h1>Sprint board</h1>
        <nav aria-label="Pages" className="tabs">
          <button
            type="button"
            data-testid="tab-board"
            aria-current={onArchive ? undefined : "page"}
            onClick={() => send({ type: "SHOW_BOARD" })}
          >
            Board
          </button>
          <button
            type="button"
            data-testid="tab-archive"
            aria-current={onArchive ? "page" : undefined}
            onClick={() => send({ type: "SHOW_ARCHIVE" })}
          >
            Archive
          </button>
        </nav>
      </header>
      <main>{onArchive ? <ArchivePage /> : <BoardPage />}</main>
    </div>
  );
}
