import { ArchivePage } from "./archive.js";
import { BoardPage } from "./board.js";
import { h } from "./dom.js";

type Tab = "board" | "archive";
interface Page { destroy(): void }

const STYLE_ID = "sprint-board-style";
const CSS = `
.sprint { --bg: #ffffff; --fg: #1d1d1f; --muted: #6b6b72; --line: #d8d8de; --card: #f5f5f7; --accent: #2f5bd3; --danger: #b3261e;
  color-scheme: light dark; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg);
  padding: 16px; min-height: 100vh; box-sizing: border-box; }
@media (prefers-color-scheme: dark) {
  .sprint { --bg: #17171a; --fg: #ececf1; --muted: #9a9aa3; --line: #34343b; --card: #222228; --accent: #8aa7ff; --danger: #ff8a80; }
}
.sprint *, .sprint *::before, .sprint *::after { box-sizing: border-box; }
.sprint [hidden] { display: none !important; }
.sprint h2 { font-size: 1rem; margin: 0 0 8px; }
.sprint ul { list-style: none; margin: 0; padding: 0; }
.sprint p { margin: 6px 0; overflow-wrap: anywhere; }
.sprint button, .sprint input { font: inherit; }
.sprint button { min-height: 36px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); cursor: pointer; }
.sprint button:disabled { opacity: 0.45; cursor: not-allowed; }
.sprint input[type="text"] { min-height: 36px; min-width: 0; flex: 1 1 auto; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
.sprint nav { display: flex; gap: 8px; margin-bottom: 16px; }
.sprint nav button[aria-current="page"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.sprint .columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.sprint .detail { margin-top: 12px; }
@media (max-width: 720px) { .sprint .columns { grid-template-columns: 1fr; } }
.sprint .column, .sprint .detail, .sprint .archive-page { border: 1px solid var(--line); border-radius: 8px; padding: 12px; min-width: 0; }
.sprint .card-row, .sprint .item-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; }
.sprint .card { flex: 1 1 160px; min-width: 0; text-align: left; background: var(--card); padding: 8px 10px; overflow-wrap: anywhere; }
.sprint .card.selected { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.sprint .card-pending { flex: 1 1 160px; padding: 8px 10px; color: var(--muted); }
.sprint .moves { display: flex; gap: 4px; flex-wrap: wrap; }
.sprint .moves button { min-width: 44px; padding: 4px 6px; font-size: 0.8rem; }
.sprint .item { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.sprint .inline-form, .sprint .add-form { display: flex; gap: 6px; margin-top: 10px; }
.sprint .detail-body .row { margin: 8px 0; }
.sprint .muted { color: var(--muted); }
.sprint .error { color: var(--danger); }
.sprint .archived-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--line); }
.sprint .archived-title { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.sprint .board .messages p { margin-top: 0; }
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  document.head.append(h("style", { attrs: { id: STYLE_ID } }, CSS));
  // An inline empty icon, so the browser does not request /favicon.ico and log a 404.
  if (!document.querySelector('link[rel="icon"]')) {
    document.head.append(h("link", { attrs: { rel: "icon", href: "data:," } }));
  }
}

function mark(button: HTMLElement, current: boolean): void {
  if (current) button.setAttribute("aria-current", "page");
  else button.removeAttribute("aria-current");
}

export default function mount(root: HTMLElement): void {
  injectStyles();
  root.classList.add("sprint");
  root.replaceChildren();

  let tab: Tab | null = null;
  let page: Page | null = null;

  const boardTab = h("button", { testid: "tab-board", attrs: { type: "button" }, on: { click: () => show("board") } }, "Board");
  const archiveTab = h("button", { testid: "tab-archive", attrs: { type: "button" }, on: { click: () => show("archive") } }, "Archive");
  const main = h("main", { cls: "page" });
  root.append(h("header", {}, h("nav", { attrs: { "aria-label": "Pages" } }, boardTab, archiveTab)), main);

  // Only the open page is on screen. Leaving a page discards it; opening it again starts it fresh.
  function show(next: Tab): void {
    if (next === tab) return;
    page?.destroy();
    main.replaceChildren();
    tab = next;
    mark(boardTab, next === "board");
    mark(archiveTab, next === "archive");
    page = next === "board" ? new BoardPage(main) : new ArchivePage(main);
  }

  show("board");
}
