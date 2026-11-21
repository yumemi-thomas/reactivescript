import { useState } from "react";
import type { Hit } from "./api.js";
import HelpPage from "./HelpPage";
import type { Intent } from "./HelpPage";
import IssuesPage from "./IssuesPage";
import SettingsPage from "./SettingsPage";

type Page = "issues" | "help" | "settings";

/** The issue desk: three pages behind a row of tabs. Leaving a page discards it. */
export default function App() {
  const [page, setPage] = useState<Page>("issues");
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);

  const open = (next: Page) => {
    if (next === page) return;
    setIntent(null);
    setPage(next);
  };

  const openHelp = (query: string, hit: Hit) => {
    setIntent({ query, hit });
    setPage("help");
  };

  return (
    <div>
      <nav>
        <button
          type="button"
          data-testid="tab-issues"
          aria-current={page === "issues" ? "page" : undefined}
          onClick={() => open("issues")}
        >
          {openCount === null ? "Issues" : `Issues (${openCount})`}
        </button>
        <button
          type="button"
          data-testid="tab-help"
          aria-current={page === "help" ? "page" : undefined}
          onClick={() => open("help")}
        >
          Help
        </button>
        <button
          type="button"
          data-testid="tab-settings"
          aria-current={page === "settings" ? "page" : undefined}
          onClick={() => open("settings")}
        >
          Settings
        </button>
      </nav>

      <main>
        {page === "issues" && <IssuesPage onOpenCount={setOpenCount} onOpenHelp={openHelp} />}
        {page === "help" && <HelpPage intent={intent} />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
