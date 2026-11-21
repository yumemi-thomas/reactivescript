import { mountArchive } from "./archive.js";
import { mountBoard } from "./board.js";
import { h } from "./dom.js";
import { injectStyles } from "./styles.js";

type Tab = "board" | "archive";

function setCurrent(button: HTMLElement, on: boolean): void {
  if (on) button.setAttribute("aria-current", "page");
  else button.removeAttribute("aria-current");
}

/**
 * Mounts the app into `root`: a row of two tabs and one page. Only the open page is in the
 * DOM. Leaving a page disposes it, so opening it again starts it afresh.
 */
export default function mount(root: HTMLElement): void {
  injectStyles(root.ownerDocument);

  const boardTab = h("button", { type: "button", "data-testid": "tab-board" }, "Board");
  const archiveTab = h("button", { type: "button", "data-testid": "tab-archive" }, "Archive");
  const page = h("main", { class: "page" });
  root.replaceChildren(
    h("header", { class: "app-header" }, h("h1", {}, "Sprint board")),
    h("nav", { class: "tabs", "aria-label": "Pages" }, boardTab, archiveTab),
    page,
  );

  let current: Tab | null = null;
  let dispose: () => void = () => undefined;

  const show = (tab: Tab): void => {
    if (tab === current) return;
    dispose();
    current = tab;
    page.replaceChildren();
    dispose = tab === "board" ? mountBoard(page) : mountArchive(page);
    setCurrent(boardTab, tab === "board");
    setCurrent(archiveTab, tab === "archive");
  };

  boardTab.addEventListener("click", () => show("board"));
  archiveTab.addEventListener("click", () => show("archive"));
  show("board");
}
