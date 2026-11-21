import { useState } from "react";
import Board from "./Board";
import Archive from "./Archive";
import "./styles";

type Page = "board" | "archive";

export default function App() {
  const [page, setPage] = useState<Page>("board");
  return (
    <div className="app">
      <nav className="tabs" role="tablist" aria-label="Pages">
        <button type="button" role="tab" data-testid="tab-board" aria-selected={page === "board"} onClick={() => setPage("board")}>
          Board
        </button>
        <button type="button" role="tab" data-testid="tab-archive" aria-selected={page === "archive"} onClick={() => setPage("archive")}>
          Archive
        </button>
      </nav>
      <main role="tabpanel">{page === "board" ? <Board /> : <Archive />}</main>
    </div>
  );
}
