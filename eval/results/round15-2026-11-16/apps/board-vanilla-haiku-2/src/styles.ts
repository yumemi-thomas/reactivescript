export const STYLES = `
.sprint-app { font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f2328; background: #ffffff;
  max-width: 1120px; margin: 0 auto; padding: 16px; box-sizing: border-box; }
.sprint-app * { box-sizing: border-box; }
.sprint-app h1 { font-size: 20px; margin: 0 0 12px; }
.sprint-app h2 { font-size: 15px; margin: 0 0 8px; }
.sprint-app .tabs { display: flex; gap: 8px; border-bottom: 1px solid #d0d7de; margin-bottom: 16px; }
.sprint-app .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 12px;
  font: inherit; color: #57606a; cursor: pointer; }
.sprint-app .tabs button[aria-current="page"] { color: #1f2328; border-bottom-color: #0969da; font-weight: 600; }
.sprint-app button { font: inherit; padding: 4px 10px; border: 1px solid #d0d7de; border-radius: 6px;
  background: #f6f8fa; color: #1f2328; cursor: pointer; }
.sprint-app button:hover:not(:disabled) { background: #eaeef2; }
.sprint-app button:disabled { opacity: 0.45; cursor: not-allowed; }
.sprint-app input[type="text"] { font: inherit; padding: 4px 8px; border: 1px solid #d0d7de; border-radius: 6px;
  min-width: 0; flex: 1 1 auto; }
.sprint-app .error { color: #cf222e; margin: 6px 0; }
.sprint-app .muted { color: #57606a; margin: 6px 0; }
.sprint-app .row, .sprint-app .add, .sprint-app .add-item { display: flex; gap: 6px; align-items: center; margin: 8px 0; }
.sprint-app .layout { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.sprint-app .board-wrap { flex: 3 1 560px; min-width: 0; }
.sprint-app .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.sprint-app .column { background: #f6f8fa; border-radius: 8px; padding: 10px; min-width: 0; }
.sprint-app .cards, .sprint-app .items, .sprint-app .archived { list-style: none; margin: 0; padding: 0; }
.sprint-app .card-row { display: flex; gap: 4px; align-items: center; margin-bottom: 8px; min-width: 0; }
.sprint-app .card { flex: 1 1 auto; min-width: 0; text-align: left; background: #ffffff; overflow-wrap: anywhere; }
.sprint-app .card.selected { border-color: #0969da; box-shadow: 0 0 0 1px #0969da; }
.sprint-app .card.pending { padding: 4px 10px; color: #57606a; border: 1px dashed #d0d7de; border-radius: 6px; }
.sprint-app .card-row button:not(.card) { padding: 2px 8px; font-size: 12px; }
.sprint-app .detail { flex: 1 1 260px; min-width: 0; border: 1px solid #d0d7de; border-radius: 8px; padding: 12px; }
.sprint-app .item-row, .sprint-app .archived li { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 3px 0; }
.sprint-app .archived li { padding: 6px 0; border-bottom: 1px solid #eaeef2; }
.sprint-app .error-row { display: flex; gap: 8px; align-items: center; }
@media (max-width: 720px) {
  .sprint-app { padding: 16px; }
  .sprint-app .board { grid-template-columns: 1fr; }
}
`;
