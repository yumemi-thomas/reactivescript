import type { Hit, Settings } from "./api.js";
import { button, h } from "./dom";
import { mountHelp, type HelpInit } from "./help";
import { mountIssues } from "./issues";
import { mountSettings } from "./settings";
import { IssueStore } from "./store";

type Page = "issues" | "help" | "settings";

const CSS = `
.desk{--bg:#fff;--fg:#1d2330;--muted:#667085;--line:#d9dde5;--accent:#2f5bd3;--err:#b42318;--sel:#eef2fc;
  font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--fg);background:var(--bg);padding:12px 16px;min-height:100%;box-sizing:border-box}
.desk[data-theme=dark]{--bg:#141820;--fg:#e6e9ef;--muted:#98a2b3;--line:#2e3542;--accent:#7ea2ff;--err:#ff8a80;--sel:#1e2635}
.desk[data-density=compact]{font-size:13px}
.desk *{box-sizing:border-box}
.desk button{font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer}
.desk button:hover{border-color:var(--accent)}
.desk button[aria-pressed=true],.desk button[aria-selected=true]{background:var(--accent);color:var(--bg);border-color:var(--accent)}
.desk button.small{padding:1px 6px;font-size:.85em}
.desk button.link{border:none;padding:2px 4px;color:var(--accent);text-align:left}
.desk input{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:4px 8px;min-width:0}
.desk .tabs{display:flex;gap:6px;border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:12px;flex-wrap:wrap}
.desk .toolbar,.desk .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
.desk .seg{display:flex;gap:4px}
.desk .cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:16px;margin-top:8px}
@media (max-width:700px){.desk .cols{grid-template-columns:1fr}}
.desk ul{list-style:none;margin:0;padding:0}
.desk .rows li{display:flex;gap:6px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding:4px 0}
.desk .rows li.selected{background:var(--sel)}
.desk button.issue{border:none;text-align:left;flex:1;overflow-wrap:anywhere}
.desk .row-actions{display:flex;gap:4px;flex-shrink:0}
.desk .detail,.desk .item{border:1px solid var(--line);border-radius:8px;padding:10px 12px;min-height:80px}
.desk .detail h2,.desk .item h2{margin:0 0 4px;font-size:1.15em}
.desk h3{font-size:.95em;margin:12px 0 4px}
.desk .muted{color:var(--muted)}
.desk .error{color:var(--err)}
.desk .error:empty{display:none}
.desk .chip{display:inline-flex;gap:4px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:1px 4px 1px 8px;margin:2px 4px 2px 0}
.desk .labels{display:flex;flex-wrap:wrap;align-items:center;gap:2px}
.desk .comments li{padding:2px 0}
.desk .hits li.selected button{font-weight:600}
.desk p{margin:4px 0}
`;

export default function mount(root: HTMLElement): void {
  const store = new IssueStore();
  let count: number | null = null;
  let destroy: (() => void) | null = null;

  const style = h("style", {}, CSS);
  const tabs: Record<Page, HTMLButtonElement> = {
    issues: button("tab-issues", "Issues", () => open("issues")),
    help: button("tab-help", "Help", () => open("help")),
    settings: button("tab-settings", "Settings", () => open("settings")),
  };
  for (const t of Object.values(tabs)) t.setAttribute("role", "tab");
  const page = h("main", { class: "page", attrs: { role: "tabpanel" } });
  const shell = h("div", { class: "desk" }, h("nav", { class: "tabs", attrs: { role: "tablist" } }, tabs.issues, tabs.help, tabs.settings), page);
  root.replaceChildren(style, shell);

  function setCount(n: number): void {
    if (n === count) return;
    count = n;
    tabs.issues.textContent = `Issues (${n})`;
  }

  function applySettings(s: Settings): void {
    shell.dataset.theme = s.theme;
    shell.dataset.density = s.density;
  }

  function open(name: Page, helpInit?: HelpInit): void {
    if (destroy) destroy();
    destroy = null;
    page.replaceChildren();
    for (const [k, t] of Object.entries(tabs)) t.setAttribute("aria-selected", String(k === name));
    if (name === "issues")
      destroy = mountIssues(page, {
        store,
        setCount,
        openRelated: (query: string, hits: Hit[], hit: Hit) => open("help", { query, hits, selected: hit }),
      });
    else if (name === "help") destroy = mountHelp(page, helpInit);
    else destroy = mountSettings(page, applySettings);
  }

  open("issues");
}
