import { el } from "./dom.js";
import { mountHelpPage } from "./help.js";
import { mountIssuesPage } from "./issues.js";
import { mountSettingsPage } from "./settings.js";
import type { HelpRequest, PageHandle, Shell } from "./shell.js";
import { APP_CSS } from "./styles.js";

type PageName = "issues" | "help" | "settings";

const PAGE_NAMES: PageName[] = ["issues", "help", "settings"];

function addStyles(): void {
  if (document.getElementById("issue-desk-style")) return;
  document.head.append(el("style", { id: "issue-desk-style" }, APP_CSS));
}

/** Mounts the issue desk into `root`: a row of tabs over one page at a time. */
export default function mount(root: HTMLElement): void {
  addStyles();

  let pageName: PageName | null = null;
  let page: PageHandle | null = null;
  /** The open-issue count shown on the issues tab; null until the open issues load once. */
  let count: number | null = null;

  const tabs: Record<PageName, HTMLButtonElement> = {
    issues: el("button", { type: "button", role: "tab", "data-testid": "tab-issues" }),
    help: el("button", { type: "button", role: "tab", "data-testid": "tab-help" }, "Help"),
    settings: el("button", { type: "button", role: "tab", "data-testid": "tab-settings" }, "Settings"),
  };
  const content = el("main", { class: "content" });

  function renderTabs(): void {
    tabs.issues.textContent = count === null ? "Issues" : `Issues (${count})`;
    for (const name of PAGE_NAMES) {
      const selected = name === pageName;
      tabs[name].setAttribute("aria-selected", String(selected));
      tabs[name].classList.toggle("active", selected);
    }
  }

  const shell: Shell = {
    setCount(next: number): void {
      count = next;
      renderTabs();
    },
    adjustCount(delta: number): void {
      if (count === null) return;
      count = Math.max(0, count + delta);
      renderTabs();
    },
    openHelp(request: HelpRequest): void {
      show("help", request);
    },
  };

  /** Shows `name` as a fresh page; leaving the previous page discards it. */
  function show(name: PageName, request?: HelpRequest): void {
    if (name === pageName && request === undefined) return;
    page?.destroy();
    const host = el("div", { class: "page-host" });
    content.replaceChildren(host);
    pageName = name;
    if (name === "issues") page = mountIssuesPage(host, shell);
    else if (name === "help") page = mountHelpPage(host, request);
    else page = mountSettingsPage(host);
    renderTabs();
  }

  for (const name of PAGE_NAMES) {
    tabs[name].addEventListener("click", () => show(name));
  }

  root.replaceChildren(
    el(
      "div",
      { class: "app" },
      el("nav", { class: "tabs", role: "tablist", "aria-label": "Pages" }, tabs.issues, tabs.help, tabs.settings),
      content
    )
  );
  show("issues");
}
