import { button, div } from "./dom.js";
import { mountHelp } from "./help.js";
import type { HelpStart } from "./help.js";
import { mountIssues } from "./issues.js";
import { OpenIssues } from "./open-count.js";
import { mountSettings } from "./settings.js";

type Page = "issues" | "help" | "settings";

export default function mount(root: HTMLElement): void {
  const tabIssues = button("Issues", () => show("issues"), { test: "tab-issues" });
  const tabHelp = button("Help", () => show("help"), { test: "tab-help" });
  const tabSettings = button("Settings", () => show("settings"), { test: "tab-settings" });
  const tabs: [Page, HTMLButtonElement][] = [
    ["issues", tabIssues],
    ["help", tabHelp],
    ["settings", tabSettings],
  ];
  const pageHost = div({ test: "page" });
  const counter = new OpenIssues((count) => {
    tabIssues.textContent = count === null ? "Issues" : `Issues (${count})`;
  });
  let current: Page | null = null;
  let disposePage: (() => void) | null = null;

  /** shows `page`; leaving a page discards it, so each visit starts it afresh */
  function show(page: Page, help?: HelpStart): void {
    if (page === current && help === undefined) return;
    disposePage?.();
    disposePage = null;
    current = page;
    for (const [name, tab] of tabs) {
      if (name === page) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    }
    pageHost.replaceChildren();
    if (page === "issues") {
      disposePage = mountIssues(pageHost, counter, (query, hitId) => show("help", { query, hitId }));
    } else if (page === "help") {
      disposePage = mountHelp(pageHost, help ?? null);
    } else {
      disposePage = mountSettings(pageHost);
    }
  }

  root.replaceChildren(div({ test: "tabs" }, [tabIssues, tabHelp, tabSettings]), pageHost);
  show("issues");
}
