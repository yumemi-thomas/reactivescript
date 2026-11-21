// The issue desk: three pages behind a row of tabs. The app opens on the issues page.

import { h } from "./dom";
import { IssuesStore } from "./issues-store";
import { mountIssues } from "./issues-page";
import { mountHelp } from "./help-page";
import type { HelpPreset } from "./help-page";
import { mountSettings } from "./settings-page";

type PageName = "issues" | "help" | "settings";

const STYLE = `
[hidden] { display: none !important; }
body { font-family: system-ui, sans-serif; margin: 0; color: #1d1d1f; background: #fff; }
.tabs { display: flex; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #d0d0d5; flex-wrap: wrap; }
.tabs button[aria-current="page"] { font-weight: 600; text-decoration: underline; }
.page { padding: 16px; }
.toolbar, .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
@media (max-width: 720px) { .split { grid-template-columns: minmax(0, 1fr); } }
.rows, .comments, .labels, .hits { list-style: none; padding: 0; margin: 0; }
.row { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
.issue { flex: 1 1 auto; text-align: left; min-width: 0; overflow-wrap: anywhere; }
.error { color: #b00020; }
.status { color: #5a5a60; }
input[type="text"] { padding: 4px 6px; max-width: 100%; }
`;

export default function mount(root: HTMLElement): void {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const store = new IssuesStore();
  const tabIssues = h("button", { testid: "tab-issues", text: "Issues", onclick: () => go("issues") });
  const tabHelp = h("button", { testid: "tab-help", text: "Help", onclick: () => go("help") });
  const tabSettings = h("button", { testid: "tab-settings", text: "Settings", onclick: () => go("settings") });
  const tabs: Record<PageName, HTMLButtonElement> = { issues: tabIssues, help: tabHelp, settings: tabSettings };
  const pageEl = h("main", { cls: "page" });
  root.replaceChildren(h("nav", { cls: "tabs" }, tabIssues, tabHelp, tabSettings), pageEl);

  let current: PageName | null = null;
  let stop: () => void = () => {};

  function renderTabs(): void {
    const n = store.openCount();
    tabIssues.textContent = n === undefined ? "Issues" : `Issues (${n})`;
    for (const name of Object.keys(tabs) as PageName[]) {
      tabs[name].setAttribute("aria-current", name === current ? "page" : "false");
    }
  }

  // Leaving a page discards it: the next visit mounts it afresh.
  function go(name: PageName, preset?: HelpPreset): void {
    if (name === current && preset === undefined) return;
    stop();
    current = name;
    pageEl.replaceChildren();
    if (name === "issues") {
      stop = mountIssues(pageEl, store, { openHelp: (p) => go("help", p) });
    } else if (name === "help") {
      stop = mountHelp(pageEl, preset);
    } else {
      stop = mountSettings(pageEl);
    }
    renderTabs();
  }

  store.subscribe(renderTabs);
  renderTabs();
  go("issues");
}
