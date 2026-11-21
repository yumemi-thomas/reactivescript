export const css = `
.app { font-family: system-ui, sans-serif; padding: 16px; color: #1d1d1f; background: #fafafa; min-height: 100vh; box-sizing: border-box; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button[aria-selected="true"] { font-weight: 600; border-bottom: 2px solid #3366cc; }
.board { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.columns { display: flex; gap: 12px; flex: 1 1 600px; min-width: 0; }
.column { flex: 1 1 0; min-width: 0; background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 8px; }
.column h2, .detail h2 { font-size: 1rem; margin: 0 0 8px; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.card { flex: 1 1 100%; cursor: pointer; padding: 6px; border-radius: 4px; background: #f3f5f9; border: 1px solid transparent; }
.card.selected { border-color: #3366cc; }
.card.temp { cursor: default; opacity: 0.6; }
.detail { flex: 0 1 320px; min-width: 240px; background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 8px; }
.error { color: #b00020; }
.muted { color: #666; }
form.inline { display: flex; gap: 4px; margin-top: 8px; }
form.inline input { flex: 1; min-width: 0; }
`;
