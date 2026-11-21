import { h, button } from "./dom";
import { mountIssues } from "./issues";
import { mountHelp, type HelpStart } from "./help";
import { mountSettings } from "./settings";

type Page = "issues" | "help" | "settings";

export interface AppContext {
  /** report the number of rows in the open-issues list as the issues page shows it */
  setOpenCount(n: number): void;
  /** switch to the help page, prefilled */
  openHelp(start: HelpStart): void;
}

export default function mount(root: HTMLElement): void {
  let current: Page | null = null;
  let unmount: (() => void) | null = null;
  let openCount: number | null = null;

  const tabs: Record<Page, HTMLButtonElement> = {
    issues: button("tab-issues", "Issues", () => show("issues"), { role: "tab" }),
    help: button("tab-help", "Help", () => show("help"), { role: "tab" }),
    settings: button("tab-settings", "Settings", () => show("settings"), { role: "tab" }),
  };
  const nav = h("nav", { role: "tablist", "aria-label": "Pages" }, tabs.issues, tabs.help, tabs.settings);
  const main = h("main", { role: "tabpanel" });
  root.replaceChildren(nav, main);

  const renderCount = () => {
    tabs.issues.textContent = openCount === null ? "Issues" : `Issues (${openCount})`;
  };

  const ctx: AppContext = {
    setOpenCount(n) {
      if (openCount === n) return;
      openCount = n;
      renderCount();
    },
    openHelp(start) { show("help", start, true); },
  };

  function show(page: Page, helpStart?: HelpStart, force = false): void {
    if (page === current && !force) return;
    if (unmount) { unmount(); unmount = null; }
    main.replaceChildren();
    current = page;
    for (const [p, t] of Object.entries(tabs) as [Page, HTMLButtonElement][]) {
      t.setAttribute("aria-selected", String(p === page));
    }
    const container = h("section", { "aria-label": page });
    main.appendChild(container);
    if (page === "issues") unmount = mountIssues(container, ctx);
    else if (page === "help") unmount = mountHelp(container, helpStart);
    else unmount = mountSettings(container);
  }

  renderCount();
  show("issues");
}
