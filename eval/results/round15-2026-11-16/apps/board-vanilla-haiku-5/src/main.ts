import { createArchive } from "./archive";
import { createBoard } from "./board";
import { h } from "./dom";
import { STYLES } from "./styles";

type Page = "board" | "archive";

function injectStyles(): void {
  if (document.getElementById("sprint-board-style") !== null) return;
  const style = document.createElement("style");
  style.id = "sprint-board-style";
  style.textContent = STYLES;
  document.head.append(style);
  // An empty icon link stops the browser requesting /favicon.ico, which the app does not serve.
  if (document.querySelector('link[rel="icon"]') === null) {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = "data:,";
    document.head.append(icon);
  }
}

function markCurrent(tab: HTMLElement, on: boolean): void {
  if (on) tab.setAttribute("aria-current", "page");
  else tab.removeAttribute("aria-current");
}

export default function mount(root: HTMLElement): void {
  injectStyles();

  const boardTab = h("button", { testid: "tab-board", cls: "tab" }, "Board");
  const archiveTab = h("button", { testid: "tab-archive", cls: "tab" }, "Archive");
  const page = h("main", { cls: "page" });
  root.replaceChildren(h("nav", { cls: "tabs" }, boardTab, archiveTab), page);

  // Only the open page is mounted. Leaving it disposes it, so opening it again starts fresh.
  let current: Page | null = null;
  let dispose: (() => void) | null = null;

  const show = (name: Page): void => {
    if (name === current) return;
    if (dispose !== null) dispose();
    dispose = null;
    current = name;
    markCurrent(boardTab, name === "board");
    markCurrent(archiveTab, name === "archive");
    page.replaceChildren();
    dispose = name === "board" ? createBoard(page) : createArchive(page);
  };

  boardTab.addEventListener("click", () => show("board"));
  archiveTab.addEventListener("click", () => show("archive"));
  show("board");
}
