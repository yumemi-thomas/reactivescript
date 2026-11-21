import { useState } from "react";
import Board from "./Board";
import Archive from "./Archive";

type Page = "board" | "archive";

const css = `
:root { color-scheme: light dark; --bg: #f6f7f9; --panel: #fff; --text: #1d2330; --muted: #667085; --line: #d6dae1; --accent: #2f6fde; --err: #b42318; }
@media (prefers-color-scheme: dark) { :root { --bg: #15181e; --panel: #1e222a; --text: #e6e8ec; --muted: #98a2b3; --line: #343a46; --accent: #6d9cf0; --err: #f97066; } }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, sans-serif; }
.app { max-width: 1200px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button[aria-selected="true"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
button { font: inherit; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--text); cursor: pointer; }
button:disabled { opacity: .45; cursor: not-allowed; }
input { font: inherit; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--text); min-width: 0; }
.board { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
.columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 900px) { .board, .columns { grid-template-columns: 1fr; } }
.column, .detail, .archive-page { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
h2 { font-size: 16px; margin: 0 0 8px; } h3 { font-size: 14px; margin: 12px 0 6px; }
.cards, .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.card-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; border: 1px solid var(--line); border-radius: 6px; padding: 6px; }
.card-row.selected { border-color: var(--accent); }
.card-row.pending { opacity: .6; }
.card-row .card { flex: 1 1 100%; text-align: left; border: 0; padding: 0; background: none; overflow-wrap: anywhere; }
.moves { display: flex; gap: 4px; }
.moves button { padding: 2px 6px; font-size: 12px; }
.items li { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.new-card, .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.new-card input, .row input { flex: 1; }
.new-card .error { flex-basis: 100%; }
.muted { color: var(--muted); }
.error { color: var(--err); }
.alerts:empty { display: none; }
`;

export default function App() {
  const [page, setPage] = useState<Page>("board");
  return (
    <div className="app">
      <style>{css}</style>
      <nav className="tabs" role="tablist">
        <button type="button" role="tab" data-testid="tab-board" aria-selected={page === "board"} onClick={() => setPage("board")}>Board</button>
        <button type="button" role="tab" data-testid="tab-archive" aria-selected={page === "archive"} onClick={() => setPage("archive")}>Archive</button>
      </nav>
      <main>{page === "board" ? <Board /> : <Archive />}</main>
    </div>
  );
}
