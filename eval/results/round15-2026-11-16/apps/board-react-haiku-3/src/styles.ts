export const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --fg: #1d2330;
  --muted: #5b6475;
  --line: #d8dce5;
  --panel: #ffffff;
  --accent: #2f6fdb;
  --danger: #b42318;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #15181f;
    --fg: #e8ebf1;
    --muted: #9aa3b5;
    --line: #2c3340;
    --panel: #1d222c;
    --accent: #7aa7ff;
    --danger: #ff8a80;
  }
}
:root[data-theme="dark"] {
  --bg: #15181f;
  --fg: #e8ebf1;
  --muted: #9aa3b5;
  --line: #2c3340;
  --panel: #1d222c;
  --accent: #7aa7ff;
  --danger: #ff8a80;
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.4 system-ui, sans-serif; }
.app { max-width: 1200px; margin: 0 auto; padding: 16px; }
.app h1 { font-size: 1.4rem; margin: 0 0 12px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
button, input { font: inherit; }
button {
  min-height: 32px; padding: 4px 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--line); background: var(--panel); color: var(--fg);
}
button:disabled { opacity: 0.45; cursor: not-allowed; }
button[aria-current="page"] { border-color: var(--accent); color: var(--accent); }
input {
  min-height: 32px; padding: 4px 8px; border-radius: 6px; max-width: 100%;
  border: 1px solid var(--line); background: var(--panel); color: var(--fg);
}
.columns { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
.column, .detail, .archive-page section {
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px;
}
.column { flex: 1 1 200px; min-width: 0; }
.detail { flex: 1 1 260px; min-width: 0; }
.archive-page { max-width: 480px; }
.column h2, .detail h2 { font-size: 1.05rem; margin: 0 0 8px; overflow-wrap: anywhere; }
.cards, .items { list-style: none; margin: 0; padding: 0; }
.card-row, .item-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
.card { flex: 1 1 auto; min-width: 0; text-align: left; overflow-wrap: anywhere; }
.card[aria-pressed="true"] { border-color: var(--accent); }
.card.pending { display: block; padding: 4px 10px; color: var(--muted); }
.move { min-width: 32px; padding: 4px 6px; }
form { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
form input { flex: 1 1 140px; min-width: 0; }
.item-row span { flex: 1 1 auto; overflow-wrap: anywhere; }
.status { color: var(--muted); margin: 4px 0; }
.error { color: var(--danger); margin: 6px 0; overflow-wrap: anywhere; }
`;
