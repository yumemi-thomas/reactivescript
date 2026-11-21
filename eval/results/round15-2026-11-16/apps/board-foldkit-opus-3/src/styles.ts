export const STYLES = `
:root {
  --bg: #f6f7f9; --panel: #ffffff; --text: #1d2330; --muted: #6b7385;
  --border: #d9dde5; --accent: #3b5bdb; --danger: #c92a2a; --selected: #e7ecff;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161b; --panel: #1d2028; --text: #e6e8ee; --muted: #9aa1b2;
    --border: #333845; --accent: #8ea2ff; --danger: #ff8787; --selected: #262d45;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.4 system-ui, -apple-system, Segoe UI, sans-serif; }
.app { max-width: 1200px; margin: 0 auto; padding: 16px; }
h1 { font-size: 1.4rem; margin: 0 0 12px; }
h2 { font-size: 1.05rem; margin: 0 0 8px; }
h3 { font-size: .95rem; margin: 16px 0 6px; }
button, input { font: inherit; color: inherit; }
button { background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
  padding: 4px 10px; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { opacity: .45; cursor: not-allowed; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
input { background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
  padding: 4px 8px; min-width: 0; flex: 1; }
.tabs { display: flex; gap: 6px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
.tab-open { background: var(--accent); color: #fff; border-color: var(--accent); }
.messages:empty { display: none; }
.error { color: var(--danger); margin: 4px 0; }
.muted, .status { color: var(--muted); margin: 4px 0; }
.board { display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start; }
.columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 900px) {
  .board { grid-template-columns: 1fr; }
  .columns { grid-template-columns: 1fr; }
}
.column, .detail, .archived { background: var(--panel); border: 1px solid var(--border);
  border-radius: 10px; padding: 12px; }
.cards, .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.card-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  border: 1px solid var(--border); border-radius: 8px; padding: 6px; }
.card-row-selected { background: var(--selected); border-color: var(--accent); }
.card { flex: 1 1 100%; text-align: left; border: none; background: transparent; padding: 2px 4px;
  overflow-wrap: anywhere; }
.card-adding, .item-adding { color: var(--muted); font-style: italic; }
.moves { display: flex; gap: 4px; }
.move { padding: 2px 8px; font-size: .85rem; }
.add-form, .inline-form { display: flex; gap: 6px; margin-top: 10px; }
.item-row { display: flex; align-items: center; gap: 8px; }
.item { flex: 1; overflow-wrap: anywhere; }
.progress { color: var(--muted); margin: 8px 0 0; }
.danger { color: var(--danger); margin-top: 8px; }
`
