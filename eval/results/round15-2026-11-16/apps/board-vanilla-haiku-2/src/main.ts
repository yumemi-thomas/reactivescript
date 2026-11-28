import { openArchive } from "./archive";
import { openBoard } from "./board";
import { button, h } from "./dom";
import { STYLES } from "./styles";

type Tab = "board" | "archive";

function installStyles(): void {
  if (document.getElementById("sprint-board-styles")) return;
  const style = h("style");
  style.id = "sprint-board-styles";
  style.textContent = STYLES;
  document.head.append(style);
}

/** Mounts the sprint board app into `root`. Opens on the board page. */
export default function mount(root: HTMLElement): void {
  installStyles();
  root.classList.add("sprint-app");

  const page = h("main", { cls: "page" });
  let current: Tab | null = null;
  let dispose: (() => void) | null = null;

  const tabButtons: Record<Tab, HTMLButtonElement> = {
    board: button("Board", () => show("board"), { testid: "tab-board" }),
    archive: button("Archive", () => show("archive"), { testid: "tab-archive" }),
  };

  // Leaving a page discards it: the next visit starts it afresh.
  function show(tab: Tab): void {
    if (tab === current) return;
    dispose?.();
    dispose = null;
    current = tab;
    for (const name of ["board", "archive"] as const) {
      if (name === tab) tabButtons[name].setAttribute("aria-current", "page");
      else tabButtons[name].removeAttribute("aria-current");
    }
    dispose = tab === "board" ? openBoard(page) : openArchive(page);
  }

  root.replaceChildren(
    h("h1", {}, "Sprint board"),
    h("nav", { cls: "tabs" }, tabButtons.board, tabButtons.archive),
    page,
  );
  show("board");
}
