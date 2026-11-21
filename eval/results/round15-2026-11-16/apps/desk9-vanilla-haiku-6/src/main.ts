import { mountHelp } from "./help";
import { mountIssues } from "./issues";
import { mountSettings } from "./settings";
import { type App, type Destroy, type HelpInit, el } from "./shared";

type Page = "issues" | "help" | "settings";

const CSS = `
.d-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid #d9dee7; margin-bottom: 16px; }
.d-tab { min-height: 40px; padding: 0 14px; border: 0; border-bottom: 2px solid transparent; background: none; font: inherit; color: #3d4659; cursor: pointer; }
.d-tab[aria-current="page"] { border-bottom-color: #2b59c3; color: #1d2330; font-weight: 600; }
.d-page { max-width: 1100px; margin: 0 auto; }
.d-issues, .d-help, .d-settings { display: grid; gap: 16px; }
@media (min-width: 800px) { .d-issues { grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); align-items: start; }
  .d-issues .d-toolbar { grid-column: 1 / -1; } }
.d-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
.d-field { display: grid; gap: 4px; font-size: 14px; color: #3d4659; }
input { min-height: 36px; padding: 0 10px; font: inherit; border: 1px solid #b8c0cf; border-radius: 6px; max-width: 100%; box-sizing: border-box; }
button { min-height: 36px; padding: 0 12px; font: inherit; border: 1px solid #b8c0cf; border-radius: 6px; background: #fff; color: #1d2330; cursor: pointer; }
button:focus-visible, input:focus-visible, .d-tab:focus-visible { outline: 2px solid #2b59c3; outline-offset: 2px; }
.d-small { min-height: 32px; padding: 0 10px; font-size: 14px; }
.d-chip[aria-pressed="true"] { background: #2b59c3; border-color: #2b59c3; color: #fff; }
.d-primary { background: #2b59c3; border-color: #2b59c3; color: #fff; }
.d-filters, .d-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.d-rows, .d-plain-list, .d-chips { list-style: none; margin: 0; padding: 0; }
.d-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 6px 4px; border-bottom: 1px solid #e6e9f0; }
.d-row.d-selected { background: #eef2fa; }
.d-issue { flex: 1 1 200px; text-align: left; border: 0; background: none; padding: 4px; word-break: break-word; }
.d-detail, .d-sub, .d-pane, .d-body { display: grid; gap: 12px; }
.d-sub { border-top: 1px solid #e6e9f0; padding-top: 12px; }
.d-sub h3 { margin: 0; font-size: 15px; }
.d-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.d-chip-item, .d-hit { display: inline-flex; gap: 6px; align-items: center; }
.d-hit { border: 0; background: none; text-align: left; padding: 4px; }
.d-h2 { margin: 0; font-size: 20px; }
.d-error { color: #b42318; margin: 0; }
.d-status { color: #5b6475; margin: 0; }
.d-saved { font-weight: 600; margin: 0; }
.d-preview, .d-count, .d-label { color: #3d4659; font-size: 14px; }
.d-item h3 { margin: 0 0 6px; }
.d-item p { margin: 0; }
`;

function injectStyles(): void {
  if (document.getElementById("desk-styles") !== null) return;
  const style = document.createElement("style");
  style.id = "desk-styles";
  style.textContent = CSS;
  document.head.append(style);
}

/** Mounts the issue desk into `root`: a row of tabs over the open page. */
export default function mount(root: HTMLElement): void {
  injectStyles();

  let openCount: number | null = null;
  let current: { page: Page; destroy: Destroy } | null = null;

  const pageEl = el("main", { testid: "page", cls: "d-page" });
  const tabs: Record<Page, HTMLButtonElement> = {
    issues: el("button", { testid: "tab-issues", cls: "d-tab", onClick: () => show("issues") }, "Issues"),
    help: el("button", { testid: "tab-help", cls: "d-tab", onClick: () => show("help") }, "Help"),
    settings: el("button", { testid: "tab-settings", cls: "d-tab", onClick: () => show("settings") }, "Settings"),
  };
  root.replaceChildren(el("nav", { cls: "d-tabs", attrs: { "aria-label": "Pages" } }, tabs.issues, tabs.help, tabs.settings), pageEl);

  function setOpenCount(n: number): void {
    openCount = n;
    renderTabs();
  }

  function renderTabs(): void {
    tabs.issues.textContent = openCount === null ? "Issues" : `Issues (${openCount})`;
    const active = current !== null ? current.page : null;
    for (const p of ["issues", "help", "settings"] as const) {
      const btn = tabs[p];
      if (active === p) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    }
  }

  /** Shows `page`. Leaving a page discards it: its pending answers are ignored from then on. */
  function show(page: Page, init?: HelpInit): void {
    if (current !== null && current.page === page && init === undefined) return;
    if (current !== null) current.destroy();
    current = null;
    pageEl.replaceChildren();
    const app: App = { setOpenCount, openHelp: i => show("help", i) };
    let destroy: Destroy;
    if (page === "issues") destroy = mountIssues(pageEl, app);
    else if (page === "help") destroy = mountHelp(pageEl, init);
    else destroy = mountSettings(pageEl);
    current = { page, destroy };
    renderTabs();
  }

  show("issues");
}
