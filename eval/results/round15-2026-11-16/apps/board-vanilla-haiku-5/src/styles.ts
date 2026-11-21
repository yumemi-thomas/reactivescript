// The app's stylesheet, injected once by mount(). Kept small: layout, states and the phone width.
export const STYLES = `
#app { font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d2330; padding: 16px; max-width: 1200px; margin: 0 auto; box-sizing: border-box; }
#app *, #app *::before, #app *::after { box-sizing: border-box; }
#app button { font: inherit; padding: 6px 10px; border: 1px solid #c4cad4; border-radius: 6px; background: #fff; cursor: pointer; }
#app button:disabled { opacity: 0.5; cursor: not-allowed; }
#app input { font: inherit; padding: 6px 8px; border: 1px solid #c4cad4; border-radius: 6px; min-width: 0; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button[aria-current="page"] { background: #2f5bea; border-color: #2f5bea; color: #fff; }
.workspace { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.columns { display: flex; gap: 12px; flex: 1 1 780px; min-width: 0; flex-wrap: wrap; }
.column { flex: 1 1 260px; min-width: 0; background: #eef1f6; border-radius: 8px; padding: 10px; }
.col-head { font-size: 15px; margin: 0 0 8px; }
.card-row { display: flex; flex-wrap: nowrap; gap: 4px; align-items: center; margin-bottom: 8px; }
.card { flex: 1 1 0; min-width: 0; text-align: left; padding: 8px; background: #fff; overflow-wrap: anywhere; }
.card.selected { border-color: #2f5bea; box-shadow: 0 0 0 1px #2f5bea; }
.card.pending { flex: 1 1 0; min-width: 0; padding: 8px; color: #667085; border: 1px dashed #98a2b3; border-radius: 6px; }
.move { flex: 0 0 auto; padding: 4px 6px; font-size: 12px; }
.add { display: flex; gap: 6px; margin-top: 8px; }
.add input { flex: 1; }
.detail { flex: 0 1 320px; min-width: 260px; background: #fff; border: 1px solid #d9dde5; border-radius: 8px; padding: 12px; }
.detail h2 { font-size: 16px; margin: 0 0 4px; overflow-wrap: anywhere; }
.where, .hint, .status { color: #667085; margin: 4px 0; }
.inline { display: flex; gap: 6px; margin: 8px 0; }
.inline input { flex: 1; }
.checklist { margin: 8px 0; }
.item-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #eef1f6; }
.danger { color: #b42318; }
.error { color: #b42318; margin: 6px 0; overflow-wrap: anywhere; }
.notices:empty { display: none; }
.archive-page { max-width: 560px; }
.archive-page h2 { font-size: 16px; }
.archived .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #eef1f6; }
@media (max-width: 600px) {
  #app { padding: 16px; }
  .columns { flex-basis: 100%; }
  .detail { flex-basis: 100%; min-width: 0; }
}
`;
