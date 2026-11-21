export const STYLES = `
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1d2430; --muted: #5f6b7a; --line: #d6dbe1; --accent: #2457c5; --error: #b42318; --panel: #f6f8fa; }
@media (prefers-color-scheme: dark) { :root { --bg: #111418; --fg: #e6e9ee; --muted: #9aa5b1; --line: #2d333b; --accent: #7aa2f7; --error: #ff8a80; --panel: #181c21; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
.desk { max-width: 1100px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 16px; flex-wrap: wrap; }
.tab { border: 1px solid transparent; border-bottom: none; background: none; color: var(--fg); padding: 8px 14px; border-radius: 6px 6px 0 0; cursor: pointer; font: inherit; }
.tab.current { border-color: var(--line); background: var(--panel); font-weight: 600; }
button { font: inherit; cursor: pointer; border: 1px solid var(--line); background: var(--panel); color: var(--fg); border-radius: 6px; padding: 4px 10px; }
button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
input { font: inherit; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); min-width: 0; }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; }
.filters { display: flex; gap: 4px; }
.columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 16px; }
@media (max-width: 720px) { .columns { grid-template-columns: minmax(0, 1fr); } }
.rows, .hits, .label-list { list-style: none; margin: 0; padding: 0; }
.row { display: flex; gap: 6px; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.row-main { flex: 1 1 auto; text-align: left; border: none; background: none; padding: 4px; overflow-wrap: anywhere; }
.row.selected .row-main { font-weight: 600; color: var(--accent); }
.detail, .item, .settings-form { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.selection { display: flex; flex-direction: column; gap: 8px; }
.actions, .inline-form { display: flex; gap: 6px; flex-wrap: wrap; }
.label-item { display: inline-flex; gap: 4px; align-items: center; margin: 0 8px 4px 0; }
.label { background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 0 8px; }
.hit button { display: block; width: 100%; border: none; background: none; text-align: left; padding: 2px 0; }
.muted { color: var(--muted); }
.error { color: var(--error); }
h2, h3 { margin: 0; }
h2 { font-size: 1.15rem; }
h3 { font-size: 0.95rem; color: var(--muted); }
p { margin: 0; }
.field { display: inline-flex; gap: 6px; align-items: center; }
`
