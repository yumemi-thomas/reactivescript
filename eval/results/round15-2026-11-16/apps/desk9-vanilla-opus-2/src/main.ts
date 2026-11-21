import { h, Page } from "./dom.js";
import { helpPage } from "./help.js";
import { HelpInit, issuesPage } from "./issues.js";
import { settingsPage } from "./settings.js";

type Tab = "issues" | "help" | "settings";

const CSS = `
.desk{font:14px/1.4 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:0 16px}
.tabs{display:flex;gap:4px;border-bottom:1px solid #ccc;margin-bottom:12px;flex-wrap:wrap}
.tabs button{border:0;background:none;padding:8px 12px;cursor:pointer}
.tabs button[aria-selected=true]{border-bottom:2px solid currentColor;font-weight:600}
.split{display:flex;gap:16px;flex-wrap:wrap}.split>*{flex:1 1 280px;min-width:0}
.list{list-style:none;padding:0}.list li{display:flex;gap:6px;align-items:center;padding:2px 0}
.issue-row{cursor:pointer;flex:1}.list li.selected .issue-row{font-weight:600}
.error{color:#b00020}.error[hidden]{display:none}.status{color:#666}
.hits li{cursor:pointer}.hits li.selected{font-weight:600}
.label-chip{display:inline-flex;gap:4px;margin-right:8px}
`;

export default function mount(root: HTMLElement): void {
  let count: number | null = null;
  let page: Page | null = null;
  let current: Tab = "issues";

  const tabIssues = h("button", { testid: "tab-issues", type: "button", role: "tab" }, "Issues");
  const tabHelp = h("button", { testid: "tab-help", type: "button", role: "tab" }, "Help");
  const tabSettings = h("button", { testid: "tab-settings", type: "button", role: "tab" }, "Settings");
  const host = h("main", { class: "page" });
  root.replaceChildren(
    h("style", {}, CSS),
    h("div", { class: "desk" }, h("nav", { class: "tabs", role: "tablist" }, tabIssues, tabHelp, tabSettings), host),
  );

  function setCount(n: number): void {
    count = n;
    tabIssues.textContent = `Issues (${n})`;
  }

  function show(tab: Tab, init?: HelpInit): void {
    page?.dispose();
    current = tab;
    page = tab === "issues" ? issuesPage({ setCount, openHelp: i => show("help", i) })
      : tab === "help" ? helpPage(init)
      : settingsPage();
    host.replaceChildren(page.el);
    for (const [t, b] of [["issues", tabIssues], ["help", tabHelp], ["settings", tabSettings]] as const) {
      b.setAttribute("aria-selected", String(t === current));
    }
    if (count === null) tabIssues.textContent = "Issues";
  }

  const go = (tab: Tab) => { if (tab !== current) show(tab); };
  tabIssues.addEventListener("click", () => go("issues"));
  tabHelp.addEventListener("click", () => go("help"));
  tabSettings.addEventListener("click", () => go("settings"));
  show("issues");
}
