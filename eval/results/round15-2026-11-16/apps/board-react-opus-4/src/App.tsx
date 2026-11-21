import { useState } from "react";
import BoardPage from "./Board";
import ArchivePage from "./Archive";
import { css } from "./styles";

type Tab = "board" | "archive";

export default function App() {
  const [tab, setTab] = useState<Tab>("board");
  return (
    <div className="app">
      <style>{css}</style>
      <nav className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "board"} data-testid="tab-board" onClick={() => setTab("board")}>Board</button>
        <button type="button" role="tab" aria-selected={tab === "archive"} data-testid="tab-archive" onClick={() => setTab("archive")}>Archive</button>
      </nav>
      <main>{tab === "board" ? <BoardPage /> : <ArchivePage />}</main>
    </div>
  );
}
