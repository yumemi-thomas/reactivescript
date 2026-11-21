import { useState } from "react";
import { ArchivePage } from "./ArchivePage";
import { BoardPage } from "./BoardPage";
import { CSS } from "./styles";

type Tab = "board" | "archive";

export default function App() {
  const [tab, setTab] = useState<Tab>("board");
  return (
    <div className="app">
      <style>{CSS}</style>
      <h1>Sprint board</h1>
      <nav className="tabs">
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
      <main>{tab === "board" ? <BoardPage /> : <ArchivePage />}</main>
    </div>
  );
}
