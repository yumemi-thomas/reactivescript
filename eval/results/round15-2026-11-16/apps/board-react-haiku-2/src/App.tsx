import { useState } from "react";
import ArchivePage from "./ArchivePage";
import BoardPage from "./BoardPage";

type Page = "board" | "archive";

export default function App() {
  const [page, setPage] = useState<Page>("board");

  return (
    <div className="app" style={{ padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Sprint board</h1>
      <nav style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          type="button"
          data-testid="tab-board"
          aria-pressed={page === "board"}
          onClick={() => setPage("board")}
        >
          Board
        </button>
        <button
          type="button"
          data-testid="tab-archive"
          aria-pressed={page === "archive"}
          onClick={() => setPage("archive")}
        >
          Archive
        </button>
      </nav>
      <main>{page === "board" ? <BoardPage /> : <ArchivePage />}</main>
    </div>
  );
}
