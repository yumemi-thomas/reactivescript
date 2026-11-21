import { useState } from "react";
import ArchivePage from "./ArchivePage";
import BoardPage from "./BoardPage";
import { CSS } from "./styles";

type Tab = "board" | "archive";

export default function App() {
  const [tab, setTab] = useState<Tab>("board");
  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <header className="app-header">
          <h1>Sprint board</h1>
          <nav className="tabs" aria-label="Pages">
            <button
              type="button"
              data-testid="tab-board"
              aria-current={tab === "board" ? "page" : undefined}
              onClick={() => setTab("board")}
            >
              Board
            </button>
            <button
              type="button"
              data-testid="tab-archive"
              aria-current={tab === "archive" ? "page" : undefined}
              onClick={() => setTab("archive")}
            >
              Archive
            </button>
          </nav>
        </header>
        <main>{tab === "board" ? <BoardPage /> : <ArchivePage />}</main>
      </div>
    </>
  );
}
