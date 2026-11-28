import type { Hit } from "./api.js";
import { h } from "./dom.js";
import { mountHelp, type HelpStart } from "./help.js";
import { mountIssues } from "./issues.js";
import { mountSettings } from "./settings.js";

type Page = "issues" | "help" | "settings";

const STYLE = `
.desk { font: 14px/1.4 system-ui, sans-serif; color: #1d1d1f; }
.desk [hidden] { display: none !important; }
.desk .tabs { display: flex; gap: 4px; border-bottom: 1px solid #ccc; margin-bottom: 12px; flex-wrap: wrap; }
.desk .tabs button[aria-selected="true"] { font-weight: 600; }
.desk .columns { display: flex; gap: 16px; flex-wrap: wrap; }
.desk .list { flex: 1 1 280px; min-width: 0; }
.desk .detail { flex: 2 1 320px; min-width: 0; }
.desk .row { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
.desk .issue { cursor: pointer; flex: 1; overflow-wrap: anywhere; }
.desk .issue.selected { font-weight: 600; }
.desk .error { color: #b00020; }
.desk .hit { cursor: pointer; }
.desk .label-chip { display: inline-flex; gap: 4px; margin-right: 8px; }
.desk input { max-width: 100%; }
`;

export default function mount(root: HTMLElement): void {
  let openCount: number | null = null;
  let current: Page = "issues";
  let dispose: (() => void) | null = null;

  const tabIssues = h("button", { testid: "tab-issues", onClick: () => show("issues") });
  const tabHelp = h("button", { testid: "tab-help", text: "Help", onClick: () => show("help") });
  const tabSettings = h("button", { testid: "tab-settings", text: "Settings", onClick: () => show("settings") });
  const tabs = h("nav", { cls: "tabs" }, tabIssues, tabHelp, tabSettings);
  tabs.setAttribute("role", "tablist");
  for (const t of [tabIssues, tabHelp, tabSettings]) t.setAttribute("role", "tab");
  const body = h("main", { cls: "page" });
  const style = h("style", { text: STYLE });
  root.replaceChildren(h("div", { cls: "desk" }, style, tabs, body));

  function renderTabs(): void {
    tabIssues.textContent = openCount === null ? "Issues" : `Issues (${openCount})`;
    tabIssues.setAttribute("aria-selected", String(current === "issues"));
    tabHelp.setAttribute("aria-selected", String(current === "help"));
    tabSettings.setAttribute("aria-selected", String(current === "settings"));
  }

  function setOpenCount(n: number): void {
    if (openCount === n) return;
    openCount = n;
    renderTabs();
  }

  function openPage(page: Page, helpStart?: HelpStart): void {
    if (dispose) dispose();
    dispose = null;
    body.replaceChildren();
    current = page;
    renderTabs();
    if (page === "issues") {
      dispose = mountIssues(body, {
        setOpenCount,
        openRelated: (query: string, hits: Hit[], hit: Hit) => openPage("help", { query, hits, hit }),
      });
    } else if (page === "help") {
      dispose = mountHelp(body, helpStart);
    } else {
      dispose = mountSettings(body);
    }
  }

  function show(page: Page): void {
    if (page === current) return;
    openPage(page);
  }

  openPage("issues");
}
