import { useActorRef, useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { deskMachine } from "./deskMachine";
import { HelpPage } from "./HelpPage";
import { IssuesPage } from "./IssuesPage";
import { SettingsPage } from "./SettingsPage";
import type { issuesMachine } from "./issuesMachine";
import type { helpMachine } from "./helpMachine";
import type { settingsMachine } from "./settingsMachine";

type Page = "issues" | "help" | "settings";

const css = `
:root { color-scheme: light dark; --fg: #1c1c1e; --bg: #ffffff; --muted: #6b6b70; --line: #d0d0d6; --accent: #2563eb; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --fg: #f2f2f4; --bg: #161618; --muted: #9a9aa2; --line: #3a3a40; --accent: #6ea8ff; } }
:root[data-theme="dark"] { --fg: #f2f2f4; --bg: #161618; --muted: #9a9aa2; --line: #3a3a40; --accent: #6ea8ff; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
.desk { padding: 16px; max-width: 1100px; margin: 0 auto; box-sizing: border-box; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 16px; }
.tabs button, .actions button, .toolbar button, .filters button, .row button, .labels button, .comments button, .detail button, .draft button, .help-page button, .settings-page button { font: inherit; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--fg); cursor: pointer; }
.tabs button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.toolbar input, .rename input, .comments input, .labels input, .help-page input, .draft input { font: inherit; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); max-width: 100%; box-sizing: border-box; }
.columns { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
@media (min-width: 800px) { .columns { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.list ul, .detail ul, .results ul, .related ul { list-style: none; padding: 0; margin: 8px 0; }
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; }
.row > button:first-child { flex: 1 1 auto; text-align: left; }
.detail section, .detail > div { margin-top: 12px; }
.detail h2 { margin: 0 0 4px; font-size: 1.2em; overflow-wrap: anywhere; }
.actions, .rename, .close, .draft > *, .labels > *, .comments > * { margin-bottom: 6px; }
.item h3 { margin: 0 0 4px; }
.draft label { display: block; margin-bottom: 6px; }
p { margin: 4px 0; overflow-wrap: anywhere; }
`;

export default function App() {
  const desk = useActorRef(deskMachine);
  const snap = useSelector(desk, (s) => s);
  const page = snap.value as Page;
  const child = snap.children[page];
  const openCount = snap.context.openCount;

  const issuesLabel = openCount === undefined ? "Issues" : `Issues (${openCount})`;

  return (
    <div className="desk">
      <style>{css}</style>
      <nav className="tabs" aria-label="Pages">
        <button
          type="button"
          data-testid="tab-issues"
          aria-pressed={page === "issues"}
          onClick={() => {
            if (page !== "issues") desk.send({ type: "SHOW_ISSUES" });
          }}
        >
          {issuesLabel}
        </button>
        <button
          type="button"
          data-testid="tab-help"
          aria-pressed={page === "help"}
          onClick={() => {
            if (page !== "help") desk.send({ type: "SHOW_HELP" });
          }}
        >
          Help
        </button>
        <button
          type="button"
          data-testid="tab-settings"
          aria-pressed={page === "settings"}
          onClick={() => {
            if (page !== "settings") desk.send({ type: "SHOW_SETTINGS" });
          }}
        >
          Settings
        </button>
      </nav>
      <main>
        {page === "issues" && child && <IssuesPage actor={child as ActorRefFrom<typeof issuesMachine>} />}
        {page === "help" && child && <HelpPage actor={child as ActorRefFrom<typeof helpMachine>} />}
        {page === "settings" && child && <SettingsPage actor={child as ActorRefFrom<typeof settingsMachine>} />}
      </main>
    </div>
  );
}
