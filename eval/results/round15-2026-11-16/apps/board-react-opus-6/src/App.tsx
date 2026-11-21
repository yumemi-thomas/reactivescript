import { useState } from "react";
import Board from "./Board";
import ArchivePage from "./Archive";

type Tab = "board" | "archive";

const css = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; }
.app { padding: 16px; max-width: 1200px; margin: 0 auto; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button[aria-selected="true"] { font-weight: bold; }
.board { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.columns { display: flex; gap: 12px; flex: 3 1 600px; flex-wrap: wrap; }
.column { flex: 1 1 180px; border: 1px solid #8884; border-radius: 8px; padding: 8px; min-width: 0; }
.column h2, .detail h2, .archive-page h2 { font-size: 1.05rem; margin: 0 0 8px; }
.cards { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-direction: column; gap: 6px; }
.card-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.card-row .card { flex: 1 1 100%; text-align: left; padding: 6px; border: 1px solid #8886; border-radius: 6px; background: transparent; color: inherit; font: inherit; overflow-wrap: anywhere; }
.card-row.selected .card { outline: 2px solid #3b82f6; }
.card-row.pending .card { opacity: .6; }
.moves { display: flex; gap: 4px; }
.detail { flex: 1 1 260px; border: 1px solid #8884; border-radius: 8px; padding: 8px; min-width: 0; }
.detail ul { list-style: none; padding: 0; }
.row { display: flex; gap: 6px; align-items: center; margin: 4px 0; flex-wrap: wrap; }
.add-card { display: flex; gap: 6px; flex-wrap: wrap; }
input { min-width: 0; flex: 1 1 120px; }
.error { color: #dc2626; }
.muted { opacity: .7; }
`;

export default function App() {
  const [tab, setTab] = useState<Tab>("board");
  return (
    <div className="app">
      <style>{css}</style>
      <nav className="tabs" role="tablist">
        <button type="button" role="tab" data-testid="tab-board" aria-selected={tab === "board"} onClick={() => setTab("board")}>Board</button>
        <button type="button" role="tab" data-testid="tab-archive" aria-selected={tab === "archive"} onClick={() => setTab("archive")}>Archive</button>
      </nav>
      <main>{tab === "board" ? <Board /> : <ArchivePage />}</main>
    </div>
  );
}
