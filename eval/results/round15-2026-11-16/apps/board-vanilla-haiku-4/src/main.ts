import { createArchive } from "./archive.js";
import { createBoard } from "./board.js";
import { el } from "./dom.js";

type Tab = "board" | "archive";

const STYLE_ID = "sprint-board-style";
const CSS = `
[hidden] { display: none !important; }
body { margin: 0; font-family: system-ui, sans-serif; }
.tabs { display: flex; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #8885; }
.tabs button[aria-selected="true"] { font-weight: 700; text-decoration: underline; }
.page { padding: 16px; max-width: 1100px; margin: 0 auto; box-sizing: border-box; }
button, input { font: inherit; min-height: 32px; max-width: 100%; }
input { min-width: 0; padding: 4px 8px; }
.error { color: #b91c1c; }
.progress, .where, .empty { margin: 6px 0; }
.row { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
.row input { flex: 1 1 160px; }
.layout { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
.columns { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
.column { border: 1px solid #8885; border-radius: 8px; padding: 12px; min-width: 0; }
.column h2 { font-size: 1.05rem; margin: 0 0 6px; }
.cards, .items, .archived-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.card-row, .item, .archived-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.card { flex: 1 1 150px; padding: 8px; border: 1px solid #8886; border-radius: 6px; cursor: pointer; overflow-wrap: anywhere; }
.card.selected { outline: 2px solid #3b82f6; }
.detail { border: 1px solid #8885; border-radius: 8px; padding: 12px; min-width: 0; }
.detail h2 { font-size: 1.1rem; margin: 0 0 4px; overflow-wrap: anywhere; }
.archived-row { justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #8883; }
@media (min-width: 800px) {
  .layout { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; }
}
`;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  document.head.append(el("style", { id: STYLE_ID }, CSS));
}

/** Mounts the app into `root`: a row of tabs over one page at a time. */
export default function mount(root: HTMLElement): void {
  injectStyle();
  const boardTab = el("button", { type: "button", "data-testid": "tab-board" }, "Board");
  const archiveTab = el("button", { type: "button", "data-testid": "tab-archive" }, "Archive");
  const host = el("main", { class: "page" });
  root.replaceChildren(el("nav", { class: "tabs" }, boardTab, archiveTab), host);

  let current: Tab | null = null;
  let discard: () => void = () => {};

  // Leaving a page discards it: its pending answers are ignored and its DOM is removed.
  const show = (tab: Tab): void => {
    if (tab === current) return;
    discard();
    current = tab;
    host.replaceChildren();
    discard = tab === "board" ? createBoard(host) : createArchive(host);
    boardTab.setAttribute("aria-selected", String(tab === "board"));
    archiveTab.setAttribute("aria-selected", String(tab === "archive"));
  };

  boardTab.addEventListener("click", () => show("board"));
  archiveTab.addEventListener("click", () => show("archive"));
  show("board");
}
