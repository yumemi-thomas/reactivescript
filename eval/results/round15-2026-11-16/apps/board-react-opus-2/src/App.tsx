import { useState } from "react";
import Board from "./Board";
import Archive from "./Archive";

type Tab = "board" | "archive";

const css = `
:root { --bg: #f5f6f8; --panel: #fff; --text: #1d2330; --muted: #6b7280; --border: #d9dde4; --accent: #2f6fde; --danger: #c0392b; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #15181e; --panel: #1f242c; --text: #e6e9ef; --muted: #9aa3b2; --border: #343b47; --accent: #6b9bf0; --danger: #ef6b5e; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, sans-serif; }
.app { max-width: 1200px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
.tabs button { border: 0; background: none; color: var(--text); padding: 8px 14px; cursor: pointer; border-bottom: 2px solid transparent; font: inherit; }
.tabs button[aria-selected="true"] { border-bottom-color: var(--accent); font-weight: 600; }
button { font: inherit; padding: 3px 8px; border: 1px solid var(--border); background: var(--panel); color: var(--text); border-radius: 4px; cursor: pointer; }
button:disabled { opacity: .45; cursor: not-allowed; }
input { font: inherit; padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--panel); color: var(--text); min-width: 0; }
.board { display: grid; grid-template-columns: 1fr 300px; gap: 16px; align-items: start; }
.columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 900px) { .board, .columns { grid-template-columns: 1fr; } }
.column, .detail, .archive-page { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
h2 { font-size: 15px; margin: 0 0 8px; }
h3 { font-size: 13px; margin: 12px 0 6px; }
ul { list-style: none; margin: 0; padding: 0; }
.card-row { border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; }
.card-row.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.card-row.pending { opacity: .6; }
.card { cursor: pointer; overflow-wrap: anywhere; }
.pending .card { cursor: default; }
.moves { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.moves button { padding: 1px 6px; font-size: 12px; }
.add-form, .row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.add-form input, .row input { flex: 1; }
.add-form .error { flex-basis: 100%; }
.item-row, .archived-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 3px 0; }
.error { color: var(--danger); margin: 4px 0; }
.muted { color: var(--muted); margin: 4px 0; }
.danger { color: var(--danger); margin-top: 8px; }
`;

export default function App() {
  const [tab, setTab] = useState<Tab>("board");
  return (
    <div className="app">
      <style>{css}</style>
      <nav className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "board"} data-testid="tab-board" onClick={() => setTab("board")}>Board</button>
        <button type="button" role="tab" aria-selected={tab === "archive"} data-testid="tab-archive" onClick={() => setTab("archive")}>Archive</button>
      </nav>
      <main>{tab === "board" ? <Board /> : <Archive />}</main>
    </div>
  );
}
