import { useState } from "react";
import ArchivePage from "./ArchivePage";
import BoardPage from "./BoardPage";

type Tab = "board" | "archive";

const CSS = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; }
.app { max-width: 1100px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button[aria-selected="true"] { font-weight: 700; text-decoration: underline; }
.board-page { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 900px) { .board-page { grid-template-columns: 3fr 1fr; } .board-page > .error { grid-column: 1; } }
.columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 640px) { .columns { grid-template-columns: 1fr; } }
.column, .detail { border: 1px solid #8884; border-radius: 8px; padding: 8px 12px; min-width: 0; }
.column h2, .detail h2 { font-size: 1.05rem; margin: 4px 0 8px; }
.cards, .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.row.selected .card { outline: 2px solid #3b82f6; }
.card { flex: 1 1 100%; text-align: left; padding: 6px 8px; border-radius: 6px; border: 1px solid #8886; background: transparent; color: inherit; font: inherit; cursor: pointer; overflow-wrap: anywhere; }
.card.pending { opacity: .6; cursor: default; }
.moves { display: flex; gap: 4px; }
.add, .inline { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.add input, .inline input { flex: 1 1 8rem; min-width: 0; }
.error { color: #dc2626; }
.muted { opacity: .7; }
`;

export default function App() {
  const [tab, setTab] = useState<Tab>("board");
  return (
    <div className="app">
      <style>{CSS}</style>
      <nav className="tabs" role="tablist">
        <button type="button" role="tab" data-testid="tab-board" aria-selected={tab === "board"} onClick={() => setTab("board")}>Board</button>
        <button type="button" role="tab" data-testid="tab-archive" aria-selected={tab === "archive"} onClick={() => setTab("archive")}>Archive</button>
      </nav>
      <main>{tab === "board" ? <BoardPage /> : <ArchivePage />}</main>
    </div>
  );
}
