import { useMachine } from "@xstate/react";
import { appMachine, type Page } from "./appMachine.js";
import { BoardPage } from "./BoardPage.js";
import { ArchivePage } from "./ArchivePage.js";
import "./styles.css";

const TABS: { page: Page; label: string }[] = [
  { page: "board", label: "Board" },
  { page: "archive", label: "Archive" },
];

export default function App() {
  const [snapshot, send] = useMachine(appMachine);
  const board = snapshot.children.board;
  const archive = snapshot.children.archive;

  return (
    <div className="app">
      <nav className="tabs" role="tablist">
        {TABS.map(({ page, label }) => {
          const open = snapshot.matches(page);
          return (
            <button
              key={page}
              type="button"
              role="tab"
              aria-selected={open}
              className={open ? "tab tab-open" : "tab"}
              data-testid={`tab-${page}`}
              onClick={() => send({ type: "open", page })}
            >
              {label}
            </button>
          );
        })}
      </nav>
      <main>
        {snapshot.matches("board") && board && <BoardPage key={board.sessionId} actor={board} />}
        {snapshot.matches("archive") && archive && <ArchivePage key={archive.sessionId} actor={archive} />}
      </main>
    </div>
  );
}
