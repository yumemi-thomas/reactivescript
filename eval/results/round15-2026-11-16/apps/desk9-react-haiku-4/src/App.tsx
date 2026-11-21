import { useEffect, useReducer, useState } from "react";
import type { Hit } from "./api.js";
import { HelpPage } from "./HelpPage";
import { IssuesPage } from "./IssuesPage";
import { SettingsPage } from "./SettingsPage";
import { INITIAL_HELP, helpReducer, seedHelp } from "./help";
import { INITIAL_ISSUES, issuesReducer, loadList, loadListWith, openCount } from "./issues";
import { INITIAL_SETTINGS, openSettings, settingsReducer } from "./settings";

type PageName = "issues" | "help" | "settings";

export default function App() {
  const [page, setPage] = useState<PageName>("issues");
  const [issues, issuesDispatch] = useReducer(issuesReducer, INITIAL_ISSUES);
  const [help, helpDispatch] = useReducer(helpReducer, INITIAL_HELP);
  const [settings, settingsDispatch] = useReducer(settingsReducer, INITIAL_SETTINGS);

  // The app opens on the issues page; its open issues load at start-up (token 0 is the initial request).
  useEffect(() => {
    loadListWith(issuesDispatch, "open", 0);
  }, []);

  // Leaving a page discards it: opening a page again starts it as the app starts.
  function go(next: PageName) {
    if (next === page) return;
    setPage(next);
    if (next === "issues") {
      issuesDispatch({ type: "resetPage" });
      loadList(issuesDispatch, "open");
    } else if (next === "help") {
      helpDispatch({ type: "reset" });
    } else {
      openSettings(settingsDispatch);
    }
  }

  function openRelated(hit: Hit, query: string) {
    setPage("help");
    seedHelp(helpDispatch, query, hit.id);
  }

  const count = openCount(issues);

  return (
    <div>
      <nav aria-label="Pages">
        <button
          type="button"
          data-testid="tab-issues"
          aria-current={page === "issues" ? "page" : undefined}
          onClick={() => go("issues")}
        >
          {count === null ? "Issues" : `Issues (${count})`}
        </button>
        <button
          type="button"
          data-testid="tab-help"
          aria-current={page === "help" ? "page" : undefined}
          onClick={() => go("help")}
        >
          Help
        </button>
        <button
          type="button"
          data-testid="tab-settings"
          aria-current={page === "settings" ? "page" : undefined}
          onClick={() => go("settings")}
        >
          Settings
        </button>
      </nav>
      <main>
        {page === "issues" && <IssuesPage state={issues} dispatch={issuesDispatch} onRelated={openRelated} />}
        {page === "help" && <HelpPage state={help} dispatch={helpDispatch} />}
        {page === "settings" && <SettingsPage state={settings} dispatch={settingsDispatch} />}
      </main>
    </div>
  );
}
