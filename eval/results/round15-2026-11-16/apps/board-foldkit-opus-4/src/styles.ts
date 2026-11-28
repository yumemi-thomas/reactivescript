export const STYLES = `
:root { color-scheme: light dark; --fg: #1d2330; --muted: #677086; --bg: #f4f5f8; --panel: #ffffff; --line: #d8dbe3; --accent: #3557d4; --error: #b42318; }
@media (prefers-color-scheme: dark) { :root { --fg: #e6e8ee; --muted: #9aa3b5; --bg: #15181f; --panel: #1f232c; --line: #343a47; --accent: #7d97ff; --error: #ff8a80; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
.app { max-width: 1200px; margin: 0 auto; padding: 16px; }
h1 { font-size: 20px; margin: 0 0 12px; }
h2 { font-size: 15px; margin: 0 0 8px; }
h3 { font-size: 13px; margin: 16px 0 6px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
button, input { font: inherit; }
button { border: 1px solid var(--line); background: var(--panel); color: var(--fg); border-radius: 6px; padding: 4px 8px; cursor: pointer; }
button:disabled { opacity: .45; cursor: not-allowed; }
input { border: 1px solid var(--line); background: var(--panel); color: var(--fg); border-radius: 6px; padding: 4px 8px; min-width: 0; flex: 1; }
.tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--line); }
.tab { border: none; border-bottom: 2px solid transparent; border-radius: 0; background: none; padding: 8px 12px; }
.tab-open { border-bottom-color: var(--accent); color: var(--accent); font-weight: 600; }
.board-layout { display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start; }
@media (max-width: 900px) { .board-layout { grid-template-columns: 1fr; } }
.columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 640px) { .columns { grid-template-columns: 1fr; } }
.column, .detail, .archive-page { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.cards, .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.card-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.card { flex: 1 1 100%; text-align: left; padding: 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); }
.card-selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.adding .card, .adding span { opacity: .6; font-style: italic; }
.moves { display: flex; gap: 4px; }
.move { padding: 2px 6px; font-size: 12px; }
.add-form { display: flex; gap: 6px; margin-top: 10px; }
.item-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.muted { color: var(--muted); }
.error { color: var(--error); }
.board-errors:empty { display: none; }
.board-errors { margin-bottom: 8px; }
.archive-page .card { flex: 1; }
`
