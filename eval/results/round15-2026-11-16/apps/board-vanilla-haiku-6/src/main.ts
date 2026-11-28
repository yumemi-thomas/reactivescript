import { mountArchive } from "./archive.js";
import { mountBoard } from "./board.js";
import { button, el } from "./dom.js";

type Tab = "board" | "archive";

const CSS = `
.tabs { display: flex; padding: 12px 16px 0; }
.tabs nav { display: flex; gap: 4px; border-bottom: 1px solid #d0d4da; width: 100%; }
.tabs button { font: inherit; background: none; border: 0; padding: 8px 12px; cursor: pointer; color: inherit; }
.tabs button.active { font-weight: 600; box-shadow: inset 0 -2px 0 #3b6fd8; }
.page { padding: 16px; font: 14px/1.4 system-ui, sans-serif; box-sizing: border-box; }
.board-page { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 960px) { .board-page { grid-template-columns: minmax(0, 1fr) 320px; } }
.columns { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 720px) { .columns { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.column { background: #f4f5f7; border-radius: 8px; padding: 12px; min-width: 0; }
.column h2 { font-size: 15px; margin: 0 0 8px; }
.card-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 6px; }
.card { flex: 1 1 auto; min-width: 0; text-align: left; background: #fff; color: inherit; border: 1px solid #d0d4da; border-radius: 6px; padding: 6px 8px; font: inherit; cursor: pointer; overflow-wrap: anywhere; }
.card.selected { border-color: #3b6fd8; box-shadow: 0 0 0 1px #3b6fd8; }
.card.adding { cursor: default; color: #666; }
.card-row button { font: inherit; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
.row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.row input, .column input { flex: 1 1 160px; min-width: 0; font: inherit; padding: 4px 6px; }
.error { color: #b00020; margin: 6px 0; }
.muted { color: #666; }
.detail { border: 1px solid #d0d4da; border-radius: 8px; padding: 12px; min-width: 0; }
.detail h3 { margin: 0 0 4px; font-size: 16px; overflow-wrap: anywhere; }
.item-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
.item { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.archive-page { max-width: 560px; }
.archived-list { list-style: none; padding: 0; margin: 0; }
.archived-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.archived-row .card { cursor: default; }
`;

/** Mounts the app into `root`: a tab row over one page at a time. Leaving a page discards it. */
export default function mount(root: HTMLElement): void {
  let current: { tab: Tab; destroy: () => void } | null = null;
  const pageHost = el("main", { class: "page" });
  const tabs: Record<Tab, HTMLButtonElement> = {
    board: button("Board", { "data-testid": "tab-board", role: "tab" }, () => open("board")),
    archive: button("Archive", { "data-testid": "tab-archive", role: "tab" }, () => open("archive")),
  };

  function open(tab: Tab): void {
    if (current !== null && current.tab === tab) return;
    current?.destroy();
    current = null;
    pageHost.replaceChildren();
    current = { tab, destroy: tab === "board" ? mountBoard(pageHost) : mountArchive(pageHost) };
    for (const name of ["board", "archive"] as const) {
      tabs[name].setAttribute("aria-selected", String(name === tab));
      tabs[name].classList.toggle("active", name === tab);
    }
  }

  root.replaceChildren(
    el("style", {}, CSS),
    el("header", { class: "tabs" }, el("nav", { role: "tablist" }, tabs.board, tabs.archive)),
    pageHost,
  );
  open("board");
}
