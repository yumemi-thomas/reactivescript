export const CSS = `
:root {
  color-scheme: light;
  --bg: #f5f6f8;
  --fg: #1b1e23;
  --muted: #5d6570;
  --panel: #ffffff;
  --border: #d5dae1;
  --accent: #2a5bd7;
  --accent-fg: #ffffff;
  --danger: #b3261e;
  --btn: #eceff3;
  --btn-fg: #1b1e23;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #121418;
    --fg: #e7e9ee;
    --muted: #9aa3af;
    --panel: #1c2026;
    --border: #3a414b;
    --accent: #82a6ff;
    --accent-fg: #0d1220;
    --danger: #ff8c84;
    --btn: #2a3038;
    --btn-fg: #e7e9ee;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #121418;
  --fg: #e7e9ee;
  --muted: #9aa3af;
  --panel: #1c2026;
  --border: #3a414b;
  --accent: #82a6ff;
  --accent-fg: #0d1220;
  --danger: #ff8c84;
  --btn: #2a3038;
  --btn-fg: #e7e9ee;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.app { max-width: 1200px; margin: 0 auto; padding: 16px; box-sizing: border-box; }
.app-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
h1 { font-size: 1.4rem; margin: 0; }
h2, h3 { margin: 0 0 8px; }
h3 { font-size: 1rem; margin-top: 12px; }
button {
  font: inherit;
  color: var(--btn-fg);
  background: var(--btn);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  min-height: 32px;
  cursor: pointer;
}
button:disabled { opacity: 0.45; cursor: not-allowed; }
button[aria-current="page"] { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
button.danger { color: var(--danger); }
input {
  font: inherit;
  color: var(--fg);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  min-width: 0;
  flex: 1 1 160px;
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tabs { display: flex; gap: 8px; }
.board-page { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); align-items: start; }
.board-main { min-width: 0; }
.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.column { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px; min-width: 0; }
.cards, .list-plain { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.card-row { display: grid; gap: 6px; }
.card { text-align: left; width: 100%; background: var(--bg); overflow-wrap: anywhere; }
.card[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.moves { display: flex; gap: 4px; flex-wrap: wrap; }
.moves button { min-height: 28px; padding: 2px 8px; font-size: 0.85rem; }
.add-form, .inline-form { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.error { color: var(--danger); margin: 8px 0; }
.muted { color: var(--muted); margin: 4px 0 12px; }
.detail { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px; min-width: 0; }
.detail-title { font-size: 1.15rem; margin: 0 0 4px; overflow-wrap: anywhere; }
.check-row, .archived-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.archive-page { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
@media (min-width: 900px) {
  .board-page { grid-template-columns: minmax(0, 1fr) 320px; }
}
@media (max-width: 480px) {
  .app { padding: 16px; }
}
`;
