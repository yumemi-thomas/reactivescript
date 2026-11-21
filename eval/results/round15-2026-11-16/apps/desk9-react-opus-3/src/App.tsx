import { useReducer, useState } from "react";
import type { Hit } from "./api";
import HelpPage, { type HelpStart } from "./HelpPage";
import IssuesPage from "./IssuesPage";
import { initialIssues, issuesReducer } from "./issuesState";
import SettingsPage from "./SettingsPage";

type Tab = "issues" | "help" | "settings";

const css = `
:root { color-scheme: light dark; --bg: #fff; --fg: #1d1f23; --muted: #6a707a; --line: #d9dce1; --accent: #2f62d6; --err: #b3261e; --sel: #eaf0fd; }
@media (prefers-color-scheme: dark) { :root { --bg: #16181c; --fg: #e7e9ec; --muted: #9aa1ab; --line: #343840; --accent: #7ea2f5; --err: #f2b8b5; --sel: #1f2a42; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
.app { max-width: 1100px; margin: 0 auto; padding: 16px; }
nav.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 16px; flex-wrap: wrap; }
nav.tabs button { border: 0; background: none; padding: 8px 14px; border-bottom: 2px solid transparent; color: inherit; font: inherit; cursor: pointer; }
nav.tabs button[aria-selected="true"] { border-bottom-color: var(--accent); color: var(--accent); font-weight: 600; }
button { font: inherit; cursor: pointer; }
input { font: inherit; padding: 4px 6px; max-width: 100%; }
ul { list-style: none; margin: 0; padding: 0; }
.muted { color: var(--muted); }
.error { color: var(--err); }
.toolbar { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.seg { display: inline-flex; gap: 4px; }
.seg button[aria-pressed="true"] { outline: 2px solid var(--accent); }
.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 16px; }
@media (max-width: 720px) { .split { grid-template-columns: minmax(0, 1fr); } }
.list .row { display: flex; gap: 6px; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--line); }
.list .row.selected { background: var(--sel); }
.row-main { flex: 1; text-align: left; background: none; border: 0; color: inherit; padding: 4px; overflow-wrap: anywhere; }
.detail, .item { border: 1px solid var(--line); border-radius: 6px; padding: 12px; min-width: 0; }
.detail h2 { margin: 0 0 4px; font-size: 1.15em; }
.detail h3 { margin: 16px 0 6px; font-size: 1em; }
.actions, .inline { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
.labels ul { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { display: inline-flex; gap: 4px; align-items: center; border: 1px solid var(--line); border-radius: 12px; padding: 2px 4px 2px 10px; }
.comments li { padding: 2px 0; }
.comments li.pending { color: var(--muted); }
.results li button { background: none; border: 0; color: inherit; padding: 2px 0; text-align: left; }
.related ul { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.form { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; max-width: 420px; }
`;

export default function App() {
  const [tab, setTab] = useState<Tab>("issues");
  const [helpStart, setHelpStart] = useState<HelpStart | null>(null);
  const [issues, dispatchIssues] = useReducer(issuesReducer, null, () => initialIssues());

  function go(next: Tab, start: HelpStart | null = null) {
    if (next === tab) return;
    // Leaving the issues page discards it; only the open count outlives it.
    if (tab === "issues") dispatchIssues({ type: "reset" });
    setHelpStart(start);
    setTab(next);
  }

  function openRelated(query: string, hits: Hit[], hit: Hit) {
    go("help", { query, hits, selected: hit.id });
  }

  const count = issues.lastCount;

  return (
    <div className="app">
      <style>{css}</style>
      <nav className="tabs" role="tablist">
        <button role="tab" data-testid="tab-issues" aria-selected={tab === "issues"} onClick={() => go("issues")}>
          {count === null ? "Issues" : `Issues (${count})`}
        </button>
        <button role="tab" data-testid="tab-help" aria-selected={tab === "help"} onClick={() => go("help")}>
          Help
        </button>
        <button role="tab" data-testid="tab-settings" aria-selected={tab === "settings"} onClick={() => go("settings")}>
          Settings
        </button>
      </nav>
      <main>
        {tab === "issues" && <IssuesPage state={issues} dispatch={dispatchIssues} onOpenRelated={openRelated} />}
        {tab === "help" && <HelpPage start={helpStart} />}
        {tab === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
