import { useCallback, useState } from "react";
import type { Hit } from "./api";
import HelpPage from "./HelpPage";
import type { HelpInit } from "./HelpPage";
import IssuesPage from "./IssuesPage";
import SettingsPage from "./SettingsPage";

type Page = { name: "issues" } | { name: "help"; init?: HelpInit } | { name: "settings" };

const css = `
:root { color-scheme: light dark; --fg: #1d2330; --muted: #6b7280; --bg: #ffffff; --line: #d8dce3; --accent: #2f5bd3; --err: #b42318; --sel: #e8eefc; }
@media (prefers-color-scheme: dark) { :root { --fg: #e6e8ee; --muted: #9aa3b2; --bg: #14171d; --line: #2c323c; --accent: #7aa2ff; --err: #ff8a80; --sel: #1f2a44; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
.app { max-width: 1100px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 16px; flex-wrap: wrap; }
.tabs button { border: 0; background: none; padding: 8px 14px; color: inherit; font: inherit; cursor: pointer; border-bottom: 2px solid transparent; }
.tabs button[aria-selected="true"] { border-bottom-color: var(--accent); font-weight: 600; }
button { font: inherit; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .6; }
input { font: inherit; padding: 4px 6px; max-width: 100%; }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; }
.seg { display: inline-flex; gap: 4px; }
.seg button[aria-pressed="true"] { outline: 2px solid var(--accent); }
.columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 16px; }
@media (max-width: 720px) { .columns { grid-template-columns: minmax(0, 1fr); } }
ul { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; gap: 6px; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.list li.selected { background: var(--sel); }
.list .row { flex: 1; text-align: left; background: none; border: 0; color: inherit; padding: 4px; }
.detail article > * + * { margin-top: 10px; }
.actions, .inline { display: flex; flex-wrap: wrap; gap: 6px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chips li { display: inline-flex; gap: 4px; align-items: center; border: 1px solid var(--line); border-radius: 12px; padding: 2px 8px; }
.hits li { padding: 4px 6px; cursor: pointer; border-radius: 4px; }
.hits li.selected { background: var(--sel); font-weight: 600; }
.muted { color: var(--muted); }
.error { color: var(--err); }
h2 { font-size: 1.15rem; margin: 0; }
h3 { font-size: 1rem; margin: 12px 0 4px; }
.settings form > * + * { margin-top: 8px; }
`;

export default function App() {
  const [page, setPage] = useState<Page>({ name: "issues" });
  // every visit mounts its page afresh
  const [visit, setVisit] = useState(0);
  const [openCount, setOpenCount] = useState<number | null>(null);

  function go(next: Page) {
    setPage(next);
    setVisit(v => v + 1);
  }

  function openTab(name: Page["name"]) {
    if (page.name === name && !(page.name === "help" && page.init)) return;
    go({ name });
  }

  const openHelp = useCallback((query: string, hits: Hit[], hit: Hit) => {
    setPage({ name: "help", init: { query, hits, hit } });
    setVisit(v => v + 1);
  }, []);

  const tabs: { name: Page["name"]; label: string }[] = [
    { name: "issues", label: openCount === null ? "Issues" : `Issues (${openCount})` },
    { name: "help", label: "Help" },
    { name: "settings", label: "Settings" },
  ];

  return (
    <div className="app">
      <style>{css}</style>
      <nav className="tabs" role="tablist" aria-label="Pages">
        {tabs.map(t => (
          <button
            key={t.name}
            type="button"
            role="tab"
            data-testid={`tab-${t.name}`}
            aria-selected={page.name === t.name}
            onClick={() => openTab(t.name)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main key={visit}>
        {page.name === "issues" && <IssuesPage onCount={setOpenCount} onOpenHelp={openHelp} />}
        {page.name === "help" && <HelpPage init={page.init} />}
        {page.name === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
