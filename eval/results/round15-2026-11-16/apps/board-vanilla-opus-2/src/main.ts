import { mountArchive } from "./archive.js";
import { mountBoard } from "./board.js";
import { el } from "./dom.js";

type Page = "board" | "archive";

const CSS = `
.sb-app { --bg:#f6f7f9; --panel:#fff; --line:#d9dde3; --text:#1d2330; --muted:#667085; --accent:#2f6fde; --err:#b42318; --errbg:#fef3f2;
  font: 14px/1.4 system-ui, sans-serif; color: var(--text); background: var(--bg); min-height: 100vh; padding: 12px 16px; box-sizing: border-box; }
@media (prefers-color-scheme: dark) { .sb-app { --bg:#14171c; --panel:#1d2128; --line:#333a45; --text:#e6e9ee; --muted:#98a2b3; --accent:#6ea0ff; --err:#ff8a80; --errbg:#3a1d1d; } }
.sb-app *, .sb-app *::before, .sb-app *::after { box-sizing: border-box; }
.sb-app button { font: inherit; padding: 2px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--text); cursor: pointer; }
.sb-app button:disabled { opacity: .45; cursor: not-allowed; }
.sb-app input { font: inherit; padding: 3px 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--text); min-width: 0; flex: 1; }
.sb-app :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.tabs button[aria-selected="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
.board { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; flex: 3 1 560px; min-width: 0; }
@media (max-width: 700px) { .columns { grid-template-columns: 1fr; } }
.column, .detail, .archive-page { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; min-width: 0; }
.detail { flex: 1 1 260px; }
.col-head { font-size: 15px; margin: 0 0 8px; }
.cards, .checklist, .archived { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.card-row, .item-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.card-row .card { flex: 1 1 140px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; cursor: pointer; overflow-wrap: anywhere; }
.card-row.selected .card { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.card-row.pending .card, .item-row.pending { opacity: .6; cursor: default; }
.moves { display: flex; gap: 3px; }
.moves button { padding: 1px 5px; font-size: 12px; }
.inline-form { display: flex; gap: 6px; margin: 8px 0; }
.muted { color: var(--muted); margin: 4px 0; }
.error { color: var(--err); background: var(--errbg); border-radius: 6px; padding: 4px 8px; margin: 4px 0; display: flex; gap: 8px; align-items: center; }
.banners:empty, .slot:empty { display: none; }
.detail-title { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
.detail h4 { margin: 12px 0 6px; }
.item { flex: 1; overflow-wrap: anywhere; }
.progress { color: var(--muted); margin: 6px 0; }
`;

export default function mount(root: HTMLElement): void {
  const style = el("style", { text: CSS });
  const tabBoard = el("button", { testid: "tab-board", text: "Board", attrs: { type: "button", role: "tab" } });
  const tabArchive = el("button", { testid: "tab-archive", text: "Archive", attrs: { type: "button", role: "tab" } });
  const nav = el("nav", { cls: "tabs", attrs: { role: "tablist", "aria-label": "Pages" } }, tabBoard, tabArchive);
  const main = el("main");
  const app = el("div", { cls: "sb-app" }, style, nav, main);
  root.replaceChildren(app);

  let current: Page | null = null;
  let dispose: (() => void) | null = null;

  function open(page: Page): void {
    if (page === current) return;
    dispose?.();
    current = page;
    tabBoard.setAttribute("aria-selected", String(page === "board"));
    tabArchive.setAttribute("aria-selected", String(page === "archive"));
    const host = el("div");
    main.replaceChildren(host);
    dispose = page === "board" ? mountBoard(host) : mountArchive(host);
  }

  tabBoard.addEventListener("click", () => open("board"));
  tabArchive.addEventListener("click", () => open("archive"));
  open("board");
}
