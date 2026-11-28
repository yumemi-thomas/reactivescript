import type { Hit } from "./api.js";
import { button, h } from "./dom.js";
import type { Page } from "./dom.js";
import { issuesPage } from "./issues.js";
import { helpPage } from "./help.js";
import type { HelpPreset } from "./help.js";
import { settingsPage } from "./settings.js";

type Tab = "issues" | "help" | "settings";

const CSS = `
.desk{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1d1f;max-width:1100px;margin:0 auto;padding:12px 16px}
.desk .tabs{display:flex;gap:4px;border-bottom:1px solid #ccd;margin-bottom:12px;flex-wrap:wrap}
.desk .tabs button{border:1px solid transparent;border-bottom:none;background:none;padding:6px 12px;cursor:pointer;border-radius:6px 6px 0 0}
.desk .tabs button[aria-selected="true"]{border-color:#ccd;background:#fff;font-weight:600;margin-bottom:-1px}
.desk button{font:inherit;cursor:pointer}
.desk input{font:inherit;padding:3px 6px;max-width:100%}
.desk .toolbar,.desk .actions,.desk .inline-form{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
.desk .filters button[aria-pressed="true"],.desk .actions button[aria-pressed="true"]{font-weight:600;outline:2px solid #4a6cf7}
.desk .columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:16px}
@media (max-width:700px){.desk .columns{grid-template-columns:minmax(0,1fr)}}
.desk ul{list-style:none;margin:0;padding:0}
.desk .row{display:flex;gap:6px;align-items:center;padding:3px 0;flex-wrap:wrap}
.desk .row .issue{flex:1 1 auto;text-align:left;background:none;border:1px solid transparent;padding:3px 6px;border-radius:4px}
.desk .row.selected .issue{border-color:#4a6cf7;background:#eef1ff}
.desk .small{font-size:12px}
.desk .error{color:#b3261e}
.desk .error:empty{display:none}
.desk .muted{color:#666}
.desk .chip{display:inline-flex;gap:4px;align-items:center;margin:2px 6px 2px 0;padding:1px 6px;border:1px solid #ccd;border-radius:10px}
.desk .label-list{display:flex;flex-wrap:wrap}
.desk .sending{color:#666;font-style:italic}
.desk .hit{padding:3px 6px;cursor:pointer;border-radius:4px}
.desk .hit.selected{background:#eef1ff}
.desk .related button{margin-right:6px}
.desk h2{font-size:18px;margin:4px 0}
.desk h3{font-size:14px;margin:12px 0 4px}
.desk [hidden]{display:none!important}
`;

export default function mount(root: HTMLElement): void {
  if (!document.getElementById("desk-styles")) {
    const style = document.createElement("style");
    style.id = "desk-styles";
    style.textContent = CSS;
    document.head.append(style);
  }

  let count: number | null = null;
  let current: { tab: Tab; page: Page } | null = null;

  const tabIssues = button("tab-issues", "Issues", () => open("issues"));
  const tabHelp = button("tab-help", "Help", () => open("help"));
  const tabSettings = button("tab-settings", "Settings", () => open("settings"));
  const tabs: Record<Tab, HTMLButtonElement> = { issues: tabIssues, help: tabHelp, settings: tabSettings };
  for (const b of Object.values(tabs)) b.setAttribute("role", "tab");
  const tabRow = h("nav", { cls: "tabs", attrs: { role: "tablist" } }, tabIssues, tabHelp, tabSettings);
  const pageEl = h("main", { cls: "page-host" });
  root.replaceChildren(h("div", { cls: "desk" }, tabRow, pageEl));

  function renderCount(): void {
    const text = count === null ? "Issues" : `Issues (${count})`;
    if (tabIssues.textContent !== text) tabIssues.textContent = text;
  }

  function show(tab: Tab, page: Page): void {
    if (current) current.page.dispose();
    current = { tab, page };
    for (const [t, b] of Object.entries(tabs)) b.setAttribute("aria-selected", String(t === tab));
    pageEl.replaceChildren(page.el);
  }

  function open(tab: Tab, preset?: HelpPreset): void {
    if (current && current.tab === tab && !preset) return;
    // Dispose first so the old page stops reporting before the new one starts.
    if (current) {
      current.page.dispose();
      current = null;
    }
    let page: Page;
    if (tab === "issues") {
      page = issuesPage({
        setCount(n: number) {
          count = n;
          renderCount();
        },
        openRelated(query: string, hits: Hit[], hit: Hit) {
          open("help", { query, hits, hit });
        },
      });
    } else if (tab === "help") page = helpPage(preset);
    else page = settingsPage();
    show(tab, page);
  }

  renderCount();
  open("issues");
}
