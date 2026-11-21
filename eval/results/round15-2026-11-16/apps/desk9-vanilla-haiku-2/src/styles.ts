/** The app's stylesheet, added to the document head once. */
export const APP_CSS = `
:root {
  --bg: #f5f6f8;
  --surface: #ffffff;
  --fg: #1c2230;
  --muted: #5a6474;
  --line: #d5dbe4;
  --accent: #2456c4;
  --accent-soft: #e6edfb;
  --danger: #b3261e;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
.app { max-width: 960px; margin: 0 auto; padding: 0 16px 32px; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px 0 8px; border-bottom: 1px solid var(--line); }
.tabs button, .filters button, .row button, .actions button, .action button, .chip button, .section button, .related button, .hits button, .item button {
  font: inherit; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 6px;
  padding: 6px 10px; cursor: pointer;
}
.tabs button[aria-selected="true"], .filters button[aria-pressed="true"], .theme button[aria-pressed="true"] {
  background: var(--accent-soft); border-color: var(--accent); color: var(--accent);
}
.tabs button:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
input[type="text"], input[type="search"] {
  font: inherit; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 6px;
  padding: 6px 10px; min-width: 0; max-width: 100%;
}
.page { padding-top: 16px; }
.toolbar, .row, .action, .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
.field { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.split { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.pane { flex: 1 1 280px; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.list .row { justify-content: space-between; }
.list .row.selected { outline: 2px solid var(--accent); border-radius: 6px; }
.issue { text-align: left; border: 0; background: none; padding: 0; color: var(--fg); }
.issue-body, .body { color: var(--muted); }
.error { color: var(--danger); margin: 4px 0; }
.status, .saved, .preview, .count { color: var(--muted); }
.chip { display: inline-flex; gap: 6px; align-items: center; margin: 2px 4px 2px 0; }
.chip span { background: var(--accent-soft); border-radius: 999px; padding: 2px 10px; }
.comments p, .labels p { margin: 4px 0; }
section { margin-top: 16px; }
h2 { margin: 0 0 8px; font-size: 18px; }
h3 { margin: 0 0 4px; font-size: 14px; color: var(--muted); }
.hits, .list { padding: 0; list-style: none; }
.hits li { margin: 4px 0; }
@media (max-width: 480px) {
  .app { padding: 0 16px 24px; }
  .pane { flex-basis: 100%; }
}
`;
