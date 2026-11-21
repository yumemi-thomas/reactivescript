export const css = `
:root {
  --bg: #f7f7f8; --surface: #ffffff; --text: #1d1d1f; --muted: #6b6b73; --border: #d9d9de;
  --accent: #2f5bd3; --accent-text: #ffffff; --error: #b3261e;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161618; --surface: #1f1f22; --text: #ececef; --muted: #9a9aa3; --border: #34343a;
    --accent: #7c9dff; --accent-text: #0b0b0c; --error: #ff8a80;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, sans-serif; }
.desk { max-width: 1100px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 16px; flex-wrap: wrap; }
.tabs button { border: 0; background: none; color: var(--muted); padding: 8px 14px; border-bottom: 2px solid transparent; }
.tabs button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent); }
button { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 4px 10px; cursor: pointer; min-height: 32px; }
button:disabled { opacity: .5; cursor: default; }
button[aria-pressed="true"] { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
input { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 5px 8px; min-width: 0; }
.field { display: inline-flex; flex-direction: column; gap: 2px; font-size: 13px; color: var(--muted); }
.field input { font-size: 15px; color: var(--text); }
.toolbar { display: flex; gap: 16px; align-items: end; flex-wrap: wrap; margin-bottom: 12px; }
.segmented { display: inline-flex; gap: 4px; }
.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 16px; }
@media (max-width: 720px) { .split { grid-template-columns: minmax(0, 1fr); } }
.list, .detail, .item, [data-testid="results"] { background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 12px; min-width: 0; }
ul { list-style: none; margin: 0; padding: 0; }
.row { display: flex; gap: 6px; align-items: center; padding: 4px 0; flex-wrap: wrap; }
.row-main { flex: 1 1 200px; text-align: left; border-color: transparent; overflow-wrap: anywhere; }
.row.selected .row-main { border-color: var(--accent); }
.hits li button { width: 100%; text-align: left; border-color: transparent; }
.hits li.selected button { border-color: var(--accent); }
.detail-body section { margin-top: 16px; }
.detail-body h2 { margin: 0 0 4px; font-size: 18px; overflow-wrap: anywhere; }
.detail-body h3 { margin: 0 0 6px; font-size: 14px; color: var(--muted); }
.actions, .action { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { display: inline-flex; gap: 4px; align-items: center; border: 1px solid var(--border); border-radius: 999px; padding: 2px 4px 2px 10px; }
.chip button { min-height: 24px; padding: 0 8px; border-radius: 999px; font-size: 12px; }
.muted { color: var(--muted); }
.error { color: var(--error); }
.settings .form { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; max-width: 420px; }
p { margin: 4px 0; }
`;
