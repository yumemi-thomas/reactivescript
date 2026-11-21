import type { Issue } from "./api.js";
import { AppContext, HelpInit, IssueOverlay, Page, PageName } from "./app.js";
import { h } from "./dom.js";
import { issuesPage } from "./issues.js";
import { helpPage } from "./help.js";
import { settingsPage } from "./settings.js";
import { STYLES } from "./styles.js";

export default function mount(root: HTMLElement): void {
  const overlays = new Map<number, IssueOverlay>();
  let lastOpen: { items: Issue[]; seq: number } | null = null;
  let page: Page | null = null;
  let current: PageName | null = null;

  const style = h("style", { text: STYLES });
  const tabIssues = h("button", { testid: "tab-issues", text: "Issues", attrs: { role: "tab" } });
  const tabHelp = h("button", { testid: "tab-help", text: "Help", attrs: { role: "tab" } });
  const tabSettings = h("button", { testid: "tab-settings", text: "Settings", attrs: { role: "tab" } });
  const tabs: Record<PageName, HTMLButtonElement> = { issues: tabIssues, help: tabHelp, settings: tabSettings };
  const nav = h("nav", { cls: "tabs", attrs: { role: "tablist" } }, tabIssues, tabHelp, tabSettings);
  const main = h("main", { cls: "page" });
  root.replaceChildren(style, h("div", { cls: "desk" }, nav, main));

  const updateCount = (): void => {
    if (!lastOpen) {
      tabIssues.textContent = "Issues";
      return;
    }
    const seq = lastOpen.seq;
    const n = lastOpen.items.filter(i => !ctx.overlay(i.id).closed.resolve(false, seq)).length;
    tabIssues.textContent = `Issues (${n})`;
  };

  const ctx: AppContext = {
    overlay(id) {
      let o = overlays.get(id);
      if (!o) {
        o = new IssueOverlay();
        overlays.set(id, o);
      }
      return o;
    },
    changed() {
      updateCount();
      page?.refresh();
    },
    setOpenIssues(items, seq) {
      lastOpen = { items, seq };
      updateCount();
    },
    openPage(name: PageName, init?: HelpInit) {
      page?.dispose();
      page = null;
      current = name;
      for (const [n, b] of Object.entries(tabs)) {
        b.setAttribute("aria-selected", String(n === name));
        b.classList.toggle("active", n === name);
      }
      page = name === "issues" ? issuesPage(ctx) : name === "help" ? helpPage(init) : settingsPage();
      main.replaceChildren(page.el);
    },
  };

  for (const [n, b] of Object.entries(tabs) as [PageName, HTMLButtonElement][]) {
    b.addEventListener("click", () => {
      if (current !== n) ctx.openPage(n);
    });
  }
  ctx.openPage("issues");
}
