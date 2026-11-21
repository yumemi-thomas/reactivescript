const CSS = `
:root {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --text: #1d2330;
  --muted: #5b6474;
  --line: #d9dde5;
  --accent: #2456c7;
  --danger: #b42318;
  --focus: #1a73e8;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #14171d;
    --surface: #1d222b;
    --text: #e8ebf1;
    --muted: #9aa3b2;
    --line: #333b48;
    --accent: #7aa2ff;
    --danger: #ff8a80;
    --focus: #8ab4f8;
  }
}
:root[data-theme="dark"] {
  --bg: #14171d;
  --surface: #1d222b;
  --text: #e8ebf1;
  --muted: #9aa3b2;
  --line: #333b48;
  --accent: #7aa2ff;
  --danger: #ff8a80;
  --focus: #8ab4f8;
}
body { background: var(--bg); color: var(--text); }
#app { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 1100px; margin: 0 auto; padding: 0 16px 32px; box-sizing: border-box; }
#app * { box-sizing: border-box; }
.app-header h1 { font-size: 1.5rem; margin: 20px 0 12px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.tabs button, button { font: inherit; min-height: 36px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface); color: var(--text); cursor: pointer; }
.tabs button[aria-current="page"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
input[type="text"] { font: inherit; min-height: 36px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--text); min-width: 0; flex: 1 1 160px; }
.muted { color: var(--muted); }
.alert { color: var(--danger); margin: 6px 0; }
.page-title { font-size: 1.25rem; }
.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; align-items: start; }
.column { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.col-head { font-size: 1rem; margin: 0 0 8px; }
.cards, .items, .archived-list { list-style: none; margin: 0; padding: 0; }
.card-row { margin-bottom: 8px; }
.card { display: block; width: 100%; text-align: left; padding: 8px 10px; word-break: break-word; }
.card.pending { border-style: dashed; color: var(--muted); padding: 8px 10px; border: 1px dashed var(--line); border-radius: 6px; }
.card[aria-pressed="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.moves { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.moves button { min-height: 32px; padding: 4px 8px; font-size: 0.85rem; }
.add-form, .row-form { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
.detail, .archived { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin-top: 12px; }
.detail-title { margin: 0 0 4px; font-size: 1.1rem; }
.checklist { margin: 8px 0; }
.item-row, .archived-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 0; }
.progress { color: var(--muted); margin: 6px 0 0; }
.panel[hidden], .detail [hidden] { display: none; }
@media (max-width: 600px) {
  .columns { grid-template-columns: 1fr; }
}
`;

/** Adds the board's stylesheet to the document once. */
export function injectStyles(doc: Document): void {
  if (doc.getElementById("sprint-board-styles") !== null) return;
  const style = doc.createElement("style");
  style.id = "sprint-board-styles";
  style.textContent = CSS;
  doc.head.append(style);
}
