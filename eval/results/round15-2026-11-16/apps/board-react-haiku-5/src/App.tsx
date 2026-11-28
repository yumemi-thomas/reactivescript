import { useState } from "react";
import { ArchivePage } from "./archive/ArchivePage";
import { BoardPage } from "./board/BoardPage";

type Tab = "board" | "archive";

const css = `
:root {
  color-scheme: light dark;
  --bg: #f5f6f8; --panel: #ffffff; --fg: #1c2230; --muted: #5b6474; --line: #d8dde6;
  --accent: #2456d3; --danger: #b42318; --bad-bg: #fdecea;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #13161c; --panel: #1b2029; --fg: #e8ebf1; --muted: #9aa3b2; --line: #343b48;
    --accent: #7c9cff; --danger: #ff8a80; --bad-bg: #3a1d1b;
  }
}
:root[data-theme="dark"] {
  --bg: #13161c; --panel: #1b2029; --fg: #e8ebf1; --muted: #9aa3b2; --line: #343b48;
  --accent: #7c9cff; --danger: #ff8a80; --bad-bg: #3a1d1b;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.4 system-ui, sans-serif; }
button, input { font: inherit; color: inherit; }
button { border: 1px solid var(--line); background: var(--panel); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button[aria-pressed="true"], .tabs button[aria-current="page"] { border-color: var(--accent); color: var(--accent); }
input { border: 1px solid var(--line); background: var(--panel); border-radius: 6px; padding: 5px 8px; min-width: 0; }
h1, h2 { font-size: 1.05rem; margin: 0.4rem 0; }
.app { max-width: 1100px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.muted { color: var(--muted); }
.error { color: var(--danger); background: var(--bad-bg); border-radius: 6px; padding: 6px 8px; margin: 6px 0; overflow-wrap: anywhere; }
.workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 300px); gap: 16px; align-items: start; }
.columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.column, .detail, .archived { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px; min-width: 0; }
.card-row { border: 1px solid var(--line); border-radius: 8px; padding: 6px; margin: 6px 0; background: var(--bg); }
.card { width: 100%; text-align: left; background: var(--panel); overflow-wrap: anywhere; }
.moves { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.moves button { padding: 2px 6px; font-size: 0.85rem; }
.add, .inline { display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap; }
.add input, .inline input { flex: 1 1 120px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; list-style: none; padding: 4px 0; border-bottom: 1px solid var(--line); }
.items { padding: 0; margin: 0; }
.danger { color: var(--danger); }
ul { padding: 0; margin: 0; }
@media (max-width: 760px) {
  .workspace, .columns { grid-template-columns: minmax(0, 1fr); }
}
`;

export default function App() {
  const [tab, setTab] = useState<Tab>("board");
  return (
    <div className="app">
      <style>{css}</style>
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
