import { mountArchive } from "./archive.js";
import { mountBoard } from "./board.js";
import { h } from "./dom.js";
import { STYLES } from "./styles.js";

type Page = "board" | "archive";

export default function mount(root: HTMLElement): void {
  if (!document.getElementById("sprint-board-styles")) {
    const style = document.createElement("style");
    style.id = "sprint-board-styles";
    style.textContent = STYLES;
    document.head.append(style);
  }
  const tabs: Record<Page, HTMLButtonElement> = {
    board: h("button", { testid: "tab-board", className: "tab", text: "Board", attrs: { role: "tab" } }),
    archive: h("button", { testid: "tab-archive", className: "tab", text: "Archive", attrs: { role: "tab" } }),
  };
  const pageEl = h("main", { className: "page", attrs: { role: "tabpanel" } });
  root.replaceChildren(h("div", { className: "sprint-app" }, [h("nav", { className: "tabs", attrs: { role: "tablist", "aria-label": "Pages" } }, [tabs.board, tabs.archive]), pageEl]));

  let current: Page | null = null;
  let unmount: (() => void) | null = null;
  function open(page: Page): void {
    if (page === current) return;
    unmount?.();
    current = page;
    for (const p of Object.keys(tabs) as Page[]) {
      tabs[p].setAttribute("aria-selected", String(p === page));
      tabs[p].classList.toggle("active", p === page);
    }
    unmount = page === "board" ? mountBoard(pageEl) : mountArchive(pageEl);
  }
  tabs.board.addEventListener("click", () => open("board"));
  tabs.archive.addEventListener("click", () => open("archive"));
  open("board");
}
