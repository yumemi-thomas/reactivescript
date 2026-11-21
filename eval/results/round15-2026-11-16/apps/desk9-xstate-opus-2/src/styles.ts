export const styles = `
.desk { font: 14px/1.45 system-ui, sans-serif; color: #1d232a; max-width: 1100px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #d0d7de; margin-bottom: 16px; }
.tabs button { border: 0; background: none; padding: 8px 14px; cursor: pointer; border-bottom: 2px solid transparent; font: inherit; }
.tabs button[aria-selected="true"] { border-bottom-color: #0969da; font-weight: 600; }
button { font: inherit; cursor: pointer; padding: 4px 10px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; }
button:disabled { cursor: not-allowed; opacity: .6; }
button[aria-pressed="true"] { background: #0969da; color: #fff; border-color: #0969da; }
input { font: inherit; padding: 4px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
input[aria-invalid="true"] { border-color: #cf222e; }
.field { display: inline-flex; gap: 8px; align-items: center; }
.toolbar { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.segmented { display: inline-flex; gap: 4px; }
.columns { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 16px; }
@media (max-width: 720px) { .columns { grid-template-columns: 1fr; } }
.list ul, .hits, .comment-list, .related-list, .chips { list-style: none; margin: 0; padding: 0; }
.row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #eaeef2; }
.row .issue { flex: 1; text-align: left; border: 0; background: none; padding: 4px; }
.row.selected .issue { font-weight: 600; }
.row-actions { display: inline-flex; gap: 4px; }
.detail, .item, .results { min-height: 4em; }
.detail-head { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.detail-head h2 { margin: 0; font-size: 18px; }
.action-row { display: flex; gap: 6px; margin: 6px 0; flex-wrap: wrap; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { display: inline-flex; gap: 4px; align-items: center; background: #ddf4ff; border-radius: 12px; padding: 2px 4px 2px 10px; }
.chip button { padding: 0 6px; font-size: 12px; border-radius: 10px; }
.sending { color: #57606a; font-style: italic; }
.hit { padding: 4px; cursor: pointer; border-radius: 4px; }
.hit.selected { background: #ddf4ff; font-weight: 600; }
.muted { color: #57606a; }
.error { color: #cf222e; }
h3 { font-size: 14px; margin: 16px 0 4px; }
.settings-form { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.preview { padding: 8px 12px; border-radius: 6px; border: 1px solid #d0d7de; }
.preview.dark { background: #1d232a; color: #f6f8fa; }
.preview.compact { padding: 2px 8px; }
`;
