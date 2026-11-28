import { mountArchive } from "./archive.js";
import { mountBoard } from "./board.js";
import { h } from "./dom.js";

type Page = "board" | "archive";

const STYLE = `
.sb-app { font: 14px/1.4 system-ui, sans-serif; color: #1d2330; max-width: 1200px; margin: 0 auto; padding: 12px; }
.sb-app button { font: inherit; cursor: pointer; border: 1px solid #b8bfcc; background: #f5f7fa; border-radius: 4px; padding: 2px 8px; }
.sb-app button:disabled { cursor: not-allowed; opacity: .45; }
.sb-app button:focus-visible, .sb-app .card:focus-visible, .sb-app input:focus-visible { outline: 2px solid #3b6fd8; outline-offset: 1px; }
.sb-app input { font: inherit; padding: 3px 6px; border: 1px solid #b8bfcc; border-radius: 4px; min-width: 0; }
.sb-tabs { display: flex; gap: 4px; border-bottom: 1px solid #d5dae3; margin-bottom: 12px; }
.sb-tabs button { border-radius: 4px 4px 0 0; border-bottom: none; }
.sb-tabs button[aria-selected="true"] { background: #fff; font-weight: 600; }
.sb-app .error { color: #b3261e; margin: 4px 0; }
.sb-app .board-layout { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.sb-app .columns { display: flex; gap: 12px; flex: 3 1 600px; min-width: 0; }
.sb-app .column { flex: 1 1 0; min-width: 0; background: #f0f2f6; border-radius: 6px; padding: 8px; }
.sb-app .col-head { font-size: 15px; margin: 0 0 8px; }
.sb-app .card-row { display: flex; gap: 4px; align-items: center; margin-bottom: 6px; }
.sb-app .card { flex: 1; min-width: 0; overflow-wrap: anywhere; background: #fff; border: 1px solid #d5dae3; border-radius: 4px; padding: 6px; cursor: pointer; }
.sb-app .card.selected { border-color: #3b6fd8; box-shadow: 0 0 0 1px #3b6fd8; }
.sb-app .card.pending { opacity: .6; cursor: default; }
.sb-app .moves { display: flex; gap: 2px; flex-wrap: wrap; }
.sb-app .moves button { padding: 2px 5px; }
.sb-app .add-form, .sb-app .rename-form, .sb-app .item-form { display: flex; gap: 4px; margin-top: 8px; }
.sb-app .add-form input, .sb-app .rename-form input, .sb-app .item-form input { flex: 1; }
.sb-app .detail { flex: 1 1 260px; border: 1px solid #d5dae3; border-radius: 6px; padding: 8px; min-width: 0; overflow-wrap: anywhere; }
.sb-app .detail h2, .sb-app .detail h3 { margin: 0 0 4px; font-size: 15px; }
.sb-app .detail-editors { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 8px; }
.sb-app .item-row { display: flex; gap: 6px; align-items: center; justify-content: space-between; margin: 3px 0; }
.sb-app .item.pending { opacity: .6; }
.sb-app .archived-row { display: flex; gap: 8px; align-items: center; margin: 4px 0; }
.sb-app .status, .sb-app .empty, .sb-app .placeholder { color: #5b6475; margin: 4px 0; }
@media (max-width: 700px) { .sb-app .columns { flex-direction: column; } }
`;

export default function mount(root: HTMLElement): void {
  if (!document.getElementById("sb-style")) {
    const style = document.createElement("style");
    style.id = "sb-style";
    style.textContent = STYLE;
    document.head.append(style);
  }

  const app = h("div", { class: "sb-app" });
  const tabBoard = h("button", { testid: "tab-board", type: "button", role: "tab" }, "Board");
  const tabArchive = h("button", { testid: "tab-archive", type: "button", role: "tab" }, "Archive");
  const tabs = h("nav", { class: "sb-tabs", role: "tablist", "aria-label": "Pages" }, tabBoard, tabArchive);
  const pageEl = h("main", { class: "sb-page", role: "tabpanel" });
  app.append(tabs, pageEl);
  root.replaceChildren(app);

  let current: Page | null = null;
  let dispose: (() => void) | null = null;

  function open(page: Page): void {
    if (page === current) return;
    dispose?.();
    dispose = null;
    pageEl.replaceChildren();
    current = page;
    tabBoard.setAttribute("aria-selected", String(page === "board"));
    tabArchive.setAttribute("aria-selected", String(page === "archive"));
    dispose = page === "board" ? mountBoard(pageEl) : mountArchive(pageEl);
  }

  tabBoard.addEventListener("click", () => open("board"));
  tabArchive.addEventListener("click", () => open("archive"));
  open("board");
}
