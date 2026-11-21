import { useMachine } from "@xstate/react";
import { createMachine } from "xstate";
import ArchivePage from "./ArchivePage";
import BoardPage from "./BoardPage";

/** Which page is open. Leaving a page unmounts it, so its machine stops and opening it again starts afresh. */
const tabsMachine = createMachine({
  id: "tabs",
  initial: "board",
  states: {
    board: { on: { "tab.archive": "archive" } },
    archive: { on: { "tab.board": "board" } },
  },
});

const CSS = `
  :root { color-scheme: light dark; --bg: #f6f7f9; --fg: #1d2330; --muted: #667085; --line: #d0d5dd; --card: #ffffff; --accent: #2b59c3; --danger: #b42318; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #14171c; --fg: #e6e9ef; --muted: #98a2b3; --line: #344054; --card: #1d2229; --accent: #7aa2ff; --danger: #ff8a80; } }
  :root[data-theme="dark"] { --bg: #14171c; --fg: #e6e9ef; --muted: #98a2b3; --line: #344054; --card: #1d2229; --accent: #7aa2ff; --danger: #ff8a80; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.4 system-ui, sans-serif; }
  .app { padding: 16px; max-width: 1200px; margin: 0 auto; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
  h1 { font-size: 20px; margin: 0; }
  nav { display: flex; gap: 8px; }
  nav button[aria-pressed="true"] { background: var(--accent); color: #fff; }
  button { font: inherit; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
  input { font: inherit; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); max-width: 100%; }
  [role="alert"] { color: var(--danger); }
  .board { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); margin-top: 12px; }
  .columns { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .column, .detail, .archive { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  ul { list-style: none; padding: 0; margin: 0; }
  .card-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 6px; }
  .card-row > button:first-child { flex: 1 1 100%; text-align: left; }
  .card-row.selected > button:first-child { border-color: var(--accent); }
  .add, .detail form { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .muted { color: var(--muted); }
  .notices p { margin: 8px 0; }
  .archive li { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
  @media (min-width: 900px) { .board { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; } .board > .notices { grid-column: 1 / -1; } }
`;

export default function App() {
  const [tabs, sendTab] = useMachine(tabsMachine);
  const onBoard = tabs.matches("board");
  return (
    <div className="app">
      <style>{CSS}</style>
      <header>
        <h1>Sprint board</h1>
        <nav aria-label="Pages">
          <button
            type="button"
            data-testid="tab-board"
            aria-pressed={onBoard}
            onClick={() => sendTab({ type: "tab.board" })}
          >
            Board
          </button>
          <button
            type="button"
            data-testid="tab-archive"
            aria-pressed={!onBoard}
            onClick={() => sendTab({ type: "tab.archive" })}
          >
            Archive
          </button>
        </nav>
      </header>
      <main>{onBoard ? <BoardPage /> : <ArchivePage />}</main>
    </div>
  );
}
