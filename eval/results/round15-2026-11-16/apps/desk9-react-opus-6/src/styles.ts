export const STYLES = `
.desk { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 16px; color: #1d1d1f; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #ccc; margin-bottom: 16px; }
.tab { border: 1px solid transparent; border-bottom: none; background: none; padding: 8px 14px; cursor: pointer; font: inherit; }
.tab.active { border-color: #ccc; background: #fff; border-radius: 6px 6px 0 0; font-weight: 600; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.issues { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 16px; }
@media (max-width: 700px) { .issues { grid-template-columns: minmax(0, 1fr); } }
.rows { list-style: none; padding: 0; margin: 0; }
.rows li { display: flex; gap: 6px; align-items: center; padding: 4px 0; border-bottom: 1px solid #eee; }
.row-main { flex: 1; text-align: left; background: none; border: none; padding: 4px; cursor: pointer; font: inherit; }
.row-main.selected { font-weight: 600; }
.error { color: #b00020; }
.muted { color: #666; }
.panel { border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
.panel section { margin-top: 12px; }
.inline { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.labels { list-style: none; padding: 0; display: flex; gap: 6px; flex-wrap: wrap; }
.labels li { background: #eef; border-radius: 10px; padding: 2px 8px; display: flex; gap: 4px; align-items: center; }
button { font: inherit; }
`;
