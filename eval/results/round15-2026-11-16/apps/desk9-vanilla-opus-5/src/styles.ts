export const STYLES = `
.desk { font: 14px/1.4 system-ui, sans-serif; color: #1d1d1f; max-width: 1100px; margin: 0 auto; padding: 12px 16px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #ccc; margin-bottom: 12px; }
.tabs button { border: 0; background: none; padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; font: inherit; }
.tabs button.active { border-bottom-color: #2563eb; font-weight: 600; }
button { font: inherit; cursor: pointer; }
input { font: inherit; padding: 4px 6px; }
.toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.segmented button[aria-pressed="true"] { background: #2563eb; color: #fff; }
.columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
@media (max-width: 700px) { .columns { grid-template-columns: 1fr; } }
.rows, .labels, .comments, .hits { list-style: none; margin: 0; padding: 0; }
.row { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
.issue { flex: 1; text-align: left; background: none; border: 1px solid transparent; padding: 4px; }
.issue[aria-current="true"] { border-color: #2563eb; background: #eef3ff; }
.small { font-size: 12px; }
.detail, .item { border: 1px solid #ddd; border-radius: 6px; padding: 12px; min-width: 0; }
.actions, .inline { display: flex; gap: 6px; margin: 6px 0; flex-wrap: wrap; }
.label-item { display: inline-flex; gap: 4px; margin-right: 8px; align-items: center; }
.label { background: #eef; border-radius: 4px; padding: 0 6px; }
.related { margin-top: 8px; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.link { background: none; border: 0; color: #2563eb; text-decoration: underline; padding: 0; }
.hit { cursor: pointer; padding: 2px 0; }
.hit.selected { font-weight: 600; }
.error { color: #b00020; }
.muted { color: #666; }
[hidden] { display: none !important; }
`;
