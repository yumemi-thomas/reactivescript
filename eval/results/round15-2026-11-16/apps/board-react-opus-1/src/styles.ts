const css = `
:root { color-scheme: light dark; --bg: #f6f7f9; --panel: #fff; --line: #d8dce3; --text: #1d2330; --muted: #667085; --accent: #2f6fde; --danger: #c0362c; }
@media (prefers-color-scheme: dark) { :root { --bg: #14171c; --panel: #1d2128; --line: #343a45; --text: #e6e9ef; --muted: #9aa3b2; --accent: #6d9cf0; --danger: #f07a70; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, sans-serif; }
.app { max-width: 1200px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--line); }
.tabs button { border: 0; background: none; color: var(--muted); padding: 8px 14px; font: inherit; cursor: pointer; border-bottom: 2px solid transparent; }
.tabs button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
button { font: inherit; }
.board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(240px, 1fr); gap: 12px; align-items: start; }
@media (max-width: 900px) { .board { grid-template-columns: 1fr; } }
.col, .detail, .archive { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; min-width: 0; }
.col h2, .detail h2, .archive h2 { font-size: 15px; margin: 0 0 8px; }
.cards, .items, .archived { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.cards li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; border: 1px solid var(--line); border-radius: 6px; padding: 6px; }
.card { flex: 1 1 100%; text-align: left; background: none; border: 0; color: inherit; padding: 2px; cursor: pointer; overflow-wrap: anywhere; }
.card[aria-pressed="true"] { font-weight: 600; color: var(--accent); }
.card.pending { color: var(--muted); cursor: default; }
.moves button, .small { font-size: 12px; padding: 1px 6px; }
.error { color: var(--danger); margin: 6px 0; }
.muted { color: var(--muted); }
form.row { display: flex; gap: 6px; margin-top: 8px; }
form.row input { flex: 1; min-width: 0; }
.items li, .archived li { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
`;
if (typeof document !== "undefined" && !document.getElementById("board-styles")) {
  const el = document.createElement("style");
  el.id = "board-styles";
  el.textContent = css;
  document.head.appendChild(el);
}
export {};
