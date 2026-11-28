import { ArchivePage } from "./archive.js";
import { BoardPage } from "./board.js";
import { button, h } from "./dom.js";

const CSS = `
.sb { font: 14px/1.4 system-ui, sans-serif; color: #1c1c1e; padding: 16px; max-width: 1200px; margin: 0 auto; }
.sb button { font: inherit; padding: 2px 8px; cursor: pointer; }
.sb button:disabled { cursor: not-allowed; opacity: .5; }
.sb input[type=text] { font: inherit; padding: 3px 6px; min-width: 0; flex: 1; }
.sb .tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid #ccc; }
.sb .tabs button[aria-selected=true] { font-weight: 600; border-bottom: 2px solid #3366cc; }
.sb .board-layout { display: grid; grid-template-columns: 1fr 300px; gap: 16px; }
.sb .columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.sb .column { background: #f4f4f6; border-radius: 6px; padding: 8px; }
.sb .column h2, .sb .detail h2 { font-size: 15px; margin: 0 0 8px; }
.sb .card-row, .sb .item-row, .sb .archived-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 6px; }
.sb .card { flex: 1 1 100%; background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 6px; cursor: pointer; overflow-wrap: anywhere; }
.sb .card.selected { border-color: #3366cc; box-shadow: 0 0 0 1px #3366cc; }
.sb .card.pending, .sb .item.pending { opacity: .6; cursor: default; }
.sb .add-row { display: flex; gap: 4px; margin: 6px 0; }
.sb .detail { border: 1px solid #ddd; border-radius: 6px; padding: 10px; align-self: start; }
.sb .checklist, .sb .archived { list-style: none; padding: 0; margin: 0; }
.sb .item { flex: 1; overflow-wrap: anywhere; }
.sb .error { color: #b00020; margin: 4px 0; }
.sb .muted { color: #666; margin: 4px 0; }
@media (max-width: 800px) { .sb .board-layout, .sb .columns { grid-template-columns: 1fr; } }
`;

type Page = { el: HTMLElement; destroy(): void };
type Tab = "board" | "archive";

export default function mount(root: HTMLElement): void {
  if (!document.getElementById("sb-style")) {
    const style = document.createElement("style");
    style.id = "sb-style";
    style.textContent = CSS;
    document.head.append(style);
  }
  let current: { tab: Tab; page: Page } | null = null;
  const content = h("main", { class: "page" });
  const tabs: Record<Tab, HTMLButtonElement> = {
    board: button("Board", "tab-board", () => open("board")),
    archive: button("Archive", "tab-archive", () => open("archive")),
  };
  for (const b of Object.values(tabs)) b.setAttribute("role", "tab");

  function open(tab: Tab): void {
    if (current && current.tab === tab) return;
    current?.page.destroy();
    const page: Page = tab === "board" ? new BoardPage() : new ArchivePage();
    current = { tab, page };
    content.replaceChildren(page.el);
    for (const [t, b] of Object.entries(tabs)) b.setAttribute("aria-selected", t === tab ? "true" : "false");
  }

  root.replaceChildren(h("div", { class: "sb" }, h("nav", { class: "tabs", role: "tablist" }, tabs.board, tabs.archive), content));
  open("board");
}
