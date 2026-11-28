export const STYLES = `
:root { color-scheme: light dark; --bg: #f6f7f9; --panel: #ffffff; --ink: #1d2330; --muted: #5d6675; --line: #d9dde4; --accent: #2f5bd3; --error: #b42318; }
@media (prefers-color-scheme: dark) { :root { --bg: #14171c; --panel: #1d2128; --ink: #e8ebf0; --muted: #9aa3b1; --line: #343a45; --accent: #7aa2ff; --error: #ff8a80; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.4 system-ui, sans-serif; }
.app { max-width: 1200px; margin: 0 auto; padding: 16px; }
.app-header { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-bottom: 16px; }
.app-header h1 { font-size: 20px; margin: 0; }
.tabs { display: flex; gap: 4px; }
button { font: inherit; cursor: pointer; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 6px; padding: 4px 10px; }
button:disabled { cursor: not-allowed; opacity: 0.4; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.tab.open { background: var(--accent); border-color: var(--accent); color: #fff; }
input { font: inherit; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--ink); min-width: 0; flex: 1; }
.board-layout { display: grid; grid-template-columns: minmax(0, 3fr) minmax(260px, 1fr); gap: 16px; align-items: start; }
.columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 860px) { .board-layout, .columns { grid-template-columns: minmax(0, 1fr); } }
.column, .detail, .archive-page { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.column h2, .detail h2, .archive-page h2 { font-size: 16px; margin: 0 0 8px; }
.cards, .items, .archived-list { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.card-row { display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--line); border-radius: 8px; }
.card-row.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.card-row.pending { opacity: 0.6; font-style: italic; }
.card { text-align: left; border: none; background: none; padding: 2px; overflow-wrap: anywhere; }
.moves { display: flex; gap: 4px; }
.move { padding: 0 8px; }
.inline-form { display: flex; gap: 6px; margin: 8px 0; }
.item-row, .archived-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.item-row.pending { opacity: 0.6; }
.error { color: var(--error); margin: 4px 0; }
.status { color: var(--muted); }
.board-errors:empty { display: none; }
.detail-column { color: var(--muted); margin-top: 0; }
`
