import { h } from "./dom.js";
import { HelpPage, type HelpInit } from "./help.js";
import { IssuesPage } from "./issues.js";
import { SettingsPage } from "./settings.js";
import { IssueStore } from "./store.js";

type PageName = "issues" | "help" | "settings";

interface Page {
  dispose(): void;
}

/** Mounts the issue desk into `root`: a row of three tabs over one page at a time. */
export default function mount(root: HTMLElement): void {
  const store = new IssueStore();
  const host = h("main", {});
  const tabs: Record<PageName, HTMLButtonElement> = {
    issues: h("button", { testid: "tab-issues", onClick: () => show("issues") }, "Issues"),
    help: h("button", { testid: "tab-help", onClick: () => show("help") }, "Help"),
    settings: h("button", { testid: "tab-settings", onClick: () => show("settings") }, "Settings"),
  };
  root.replaceChildren(h("nav", {}, tabs.issues, tabs.help, tabs.settings), host);

  let active: PageName | null = null;
  let page: Page | null = null;

  const renderTabs = (): void => {
    const open = store.openCount();
    tabs.issues.textContent = open === null ? "Issues" : `Issues (${open})`;
    for (const name of ["issues", "help", "settings"] as const) {
      tabs[name].setAttribute("aria-current", name === active ? "page" : "false");
    }
  };

  function show(name: PageName, init?: HelpInit): void {
    if (name === active && init === undefined) return;
    page?.dispose();
    page = null;
    host.replaceChildren();
    active = name;
    renderTabs();
    switch (name) {
      case "issues":
        page = new IssuesPage(host, store, {
          openHelp: (query, selectId) => show("help", { query, selectId }),
        });
        break;
      case "help":
        page = new HelpPage(host, init);
        break;
      case "settings":
        page = new SettingsPage(host);
        break;
    }
  }

  store.subscribe(renderTabs);
  show("issues");
}
