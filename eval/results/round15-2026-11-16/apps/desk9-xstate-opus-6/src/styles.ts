export const styles = `
:root { font-family: system-ui, sans-serif; color: #1d2330; background: #f6f7f9; }
body { margin: 0; }
.desk { max-width: 1100px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #ccd; margin-bottom: 16px; }
.tab { border: 1px solid transparent; border-bottom: none; background: none; padding: 8px 14px; cursor: pointer; font: inherit; }
.tab.active { border-color: #ccd; background: #fff; border-radius: 6px 6px 0 0; font-weight: 600; }
button { font: inherit; cursor: pointer; }
input { font: inherit; padding: 4px 6px; }
.issues { display: grid; grid-template-columns: minmax(280px, 1fr) 2fr; gap: 16px; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.rows { list-style: none; padding: 0; margin: 0; }
.rows li { display: flex; gap: 6px; align-items: center; padding: 4px 0; }
.issue { flex: 1; text-align: left; background: #fff; border: 1px solid #dde; border-radius: 4px; padding: 6px 8px; }
.issue.selected { border-color: #4a6cf7; background: #eef2ff; }
.pressed { font-weight: 600; }
.panel { background: #fff; border: 1px solid #dde; border-radius: 6px; padding: 12px; }
.section { margin-top: 12px; }
.error { color: #b00020; }
.muted { color: #667; }
.field { display: flex; gap: 6px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
.label-chip { display: inline-flex; gap: 4px; align-items: center; margin-right: 8px; }
.hit.selected { font-weight: 600; }
@media (max-width: 700px) { .issues { grid-template-columns: 1fr; } }
`;
