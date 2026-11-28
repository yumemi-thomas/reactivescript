import { mountArchive } from "./archive.js";
import { mountBoard } from "./board.js";
import { h } from "./dom.js";

type Page = "board" | "archive";

const CSS = `
:root { color-scheme: light dark; --bg:#f6f7f9; --panel:#fff; --text:#1d2330; --muted:#667085; --line:#d8dde5; --accent:#2f6fde; --err:#b42318; }
@media (prefers-color-scheme: dark) { :root { --bg:#14171c; --panel:#1d2129; --text:#e6e9ef; --muted:#98a2b3; --line:#343a46; --accent:#6ea0ff; --err:#ff8a80; } }
.sb { font: 14px/1.4 system-ui, sans-serif; color: var(--text); background: var(--bg); padding: 16px; min-height: 100vh; box-sizing: border-box; }
.sb * { box-sizing: border-box; }
.sb .tabs { display:flex; gap:4px; border-bottom:1px solid var(--line); margin-bottom:16px; }
.sb .tabs button { border:none; background:none; padding:8px 14px; color:var(--muted); border-bottom:2px solid transparent; cursor:pointer; font:inherit; }
.sb .tabs button[aria-selected="true"] { color:var(--text); border-bottom-color:var(--accent); font-weight:600; }
.sb button { font:inherit; cursor:pointer; }
.sb button:disabled { cursor:not-allowed; opacity:.45; }
.sb .board-main { display:grid; grid-template-columns: 1fr minmax(260px, 340px); gap:16px; align-items:start; }
.sb .columns { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:12px; }
@media (max-width: 900px) { .sb .board-main, .sb .columns { grid-template-columns: 1fr; } }
.sb .column, .sb .detail, .sb .archive-page { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; min-width:0; }
.sb h2 { font-size:15px; margin:0 0 8px; }
.sb h3 { font-size:13px; margin:12px 0 6px; color:var(--muted); }
.sb ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.sb .row { display:flex; gap:6px; align-items:center; }
.sb .card { flex:1; min-width:0; text-align:left; padding:6px 8px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--text); overflow-wrap:anywhere; }
.sb .card.selected { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
.sb .card.pending, .sb .item.pending { opacity:.6; font-style:italic; }
.sb .moves { display:flex; gap:2px; }
.sb .moves button { padding:2px 6px; }
.sb .item { flex:1; overflow-wrap:anywhere; }
.sb .add-row { display:flex; gap:6px; margin-top:10px; }
.sb .add-row input { flex:1; min-width:0; padding:5px 8px; border:1px solid var(--line); border-radius:6px; background:var(--panel); color:var(--text); font:inherit; }
.sb .muted { color:var(--muted); margin:4px 0; }
.sb .error { color:var(--err); margin:6px 0; }
.sb .banners:empty { display:none; }
.sb .danger { margin-top:10px; color:var(--err); }
`;

export default function mount(root: HTMLElement): void {
  if (!document.getElementById("sprint-board-style")) {
    const style = document.createElement("style");
    style.id = "sprint-board-style";
    style.textContent = CSS;
    document.head.append(style);
  }
  root.replaceChildren();
  root.classList.add("sb");

  let current: Page | null = null;
  let dispose: (() => void) | null = null;
  const tabBoard = h("button", { testid: "tab-board", text: "Board", attrs: { role: "tab" }, onClick: () => open("board") });
  const tabArchive = h("button", { testid: "tab-archive", text: "Archive", attrs: { role: "tab" }, onClick: () => open("archive") });
  const pageHost = h("main", { attrs: { role: "tabpanel" } });
  root.append(h("nav", { class: "tabs", attrs: { role: "tablist" } }, tabBoard, tabArchive), pageHost);

  function open(page: Page): void {
    if (page === current) return;
    dispose?.();
    pageHost.replaceChildren();
    current = page;
    tabBoard.setAttribute("aria-selected", String(page === "board"));
    tabArchive.setAttribute("aria-selected", String(page === "archive"));
    dispose = page === "board" ? mountBoard(pageHost) : mountArchive(pageHost);
  }

  open("board");
}
