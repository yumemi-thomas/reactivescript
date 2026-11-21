import { useReducer, useState } from "react";
import type { Hit } from "./api.js";
import { HelpPage, type HelpStart } from "./HelpPage";
import { IssuesPage } from "./IssuesPage";
import { initialIssuesStore, issuesReducer, openCount } from "./issuesStore";
import { SettingsPage } from "./SettingsPage";

type Page = "issues" | "help" | "settings";

const css = `
:root { color-scheme: light dark; --bg: #fff; --fg: #1b1b1f; --muted: #6b6b76; --line: #d9d9e0; --accent: #3b5bdb; --err: #c92a2a; }
@media (prefers-color-scheme: dark) { :root { --bg: #16161a; --fg: #e8e8ee; --muted: #9a9aa6; --line: #33333b; --accent: #7c95ff; --err: #ff8787; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
.app { max-width: 960px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.tabs button[aria-selected="true"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
button { font: inherit; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
button:hover { border-color: var(--accent); }
input { font: inherit; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: inherit; min-width: 0; }
ul { list-style: none; padding: 0; margin: 0; }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
@media (max-width: 700px) { .cols { grid-template-columns: minmax(0, 1fr); } }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 4px 0; }
.issue-btn, .hit-btn { border: none; padding: 2px 4px; text-align: left; }
.panel { border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.muted { color: var(--muted); }
.error { color: var(--err); }
.field { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
h2, h3 { margin: 4px 0 8px; }
h3 { font-size: 1em; }
section { margin-top: 12px; }
.chip { display: inline-flex; gap: 4px; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 4px 0 10px; margin: 2px; }
.chip button { border: none; padding: 0 6px; }
`;

export default function App() {
  const [page, setPage] = useState<Page>("issues");
  const [helpStart, setHelpStart] = useState<HelpStart | null>(null);
  const [store, dispatch] = useReducer(issuesReducer, initialIssuesStore);
  const count = openCount(store);

  function go(next: Page) {
    if (next === page) return;
    setHelpStart(null);
    setPage(next);
  }

  function openRelated(query: string, hits: Hit[], hit: Hit) {
    setHelpStart({ query, hits, selectedId: hit.id });
    setPage("help");
  }

  return (
    <div className="app">
      <style>{css}</style>
      <nav className="tabs" role="tablist">
        <button data-testid="tab-issues" role="tab" aria-selected={page === "issues"} onClick={() => go("issues")}>
          {count === null ? "Issues" : `Issues (${count})`}
        </button>
        <button data-testid="tab-help" role="tab" aria-selected={page === "help"} onClick={() => go("help")}>
          Help
        </button>
        <button data-testid="tab-settings" role="tab" aria-selected={page === "settings"} onClick={() => go("settings")}>
          Settings
        </button>
      </nav>
      <main>
        {page === "issues" && <IssuesPage store={store} dispatch={dispatch} onOpenRelated={openRelated} />}
        {page === "help" && <HelpPage start={helpStart} />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
