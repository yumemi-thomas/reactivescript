export const STYLES = `
.sprint-app { font: 14px/1.4 system-ui, sans-serif; color: #1f2328; max-width: 1200px; margin: 0 auto; padding: 12px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #d0d7de; margin-bottom: 12px; }
.tab { border: 1px solid transparent; border-bottom: none; background: none; padding: 6px 14px; cursor: pointer; border-radius: 6px 6px 0 0; font: inherit; }
.tab.active { border-color: #d0d7de; background: #fff; font-weight: 600; margin-bottom: -1px; }
.board-main { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.columns { display: flex; gap: 12px; flex: 3 1 600px; min-width: 0; }
.column { flex: 1 1 0; min-width: 0; background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 8px; padding: 8px; }
.col-head { font-size: 15px; margin: 0 0 8px; }
.cards, .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.card-row { background: #fff; border: 1px solid #d0d7de; border-radius: 6px; padding: 6px; }
.card-row.selected { border-color: #0969da; box-shadow: 0 0 0 1px #0969da; }
.card-row.pending { opacity: .6; }
.card { display: block; width: 100%; text-align: left; background: none; border: none; padding: 2px; font: inherit; cursor: pointer; overflow-wrap: anywhere; }
.moves { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
button { font: inherit; }
button:disabled { opacity: .45; cursor: not-allowed; }
.move { font-size: 12px; padding: 1px 6px; }
.add-form, .inline-form { display: flex; gap: 4px; margin-top: 8px; }
.add-form input, .inline-form input { flex: 1; min-width: 0; padding: 4px 6px; }
.detail { flex: 1 1 260px; border: 1px solid #d0d7de; border-radius: 8px; padding: 10px; background: #fff; }
.detail-title { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
.detail-where { margin: 2px 0 8px; color: #57606a; }
.detail h3 { font-size: 14px; margin: 14px 0 6px; }
.item-row { display: flex; gap: 6px; align-items: center; justify-content: space-between; }
.item { font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
.item-row.pending { opacity: .6; }
.progress { color: #57606a; margin: 6px 0 0; }
.msg { margin: 6px 0; }
.msg[hidden] { display: none; }
.error { color: #cf222e; }
.muted, .empty { color: #57606a; }
.danger { margin-top: 8px; color: #cf222e; }
.status { margin: 4px 0; }
@media (max-width: 700px) { .columns { flex-direction: column; } }
`;
