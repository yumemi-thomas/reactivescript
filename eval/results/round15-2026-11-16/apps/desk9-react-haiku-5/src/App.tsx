import { useState } from "react";
import HelpPage, { type HelpSeed } from "./HelpPage";
import IssuesPage from "./IssuesPage";
import SettingsPage from "./SettingsPage";

type Page = "issues" | "help" | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("issues");
  // Kept here, not in the issues page, so it survives leaving that page.
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [helpSeed, setHelpSeed] = useState<HelpSeed | null>(null);

  // Leaving a page discards it: each page is mounted only while open.
  function go(next: Page) {
    if (next === page) return;
    setHelpSeed(null);
    setPage(next);
  }

  function openHelp(query: string, hitId: number) {
    setHelpSeed({ query, hitId });
    setPage("help");
  }

  const issuesLabel = openCount === null ? "Issues" : `Issues (${openCount})`;

  return (
    <div className="desk">
      <nav aria-label="Pages">
        <button
          data-testid="tab-issues"
          aria-current={page === "issues" ? "page" : undefined}
          onClick={() => go("issues")}
        >
          {issuesLabel}
        </button>
        <button
          data-testid="tab-help"
          aria-current={page === "help" ? "page" : undefined}
          onClick={() => go("help")}
        >
          Help
        </button>
        <button
          data-testid="tab-settings"
          aria-current={page === "settings" ? "page" : undefined}
          onClick={() => go("settings")}
        >
          Settings
        </button>
      </nav>
      <main>
        {page === "issues" && <IssuesPage onOpenCount={setOpenCount} onOpenHelp={openHelp} />}
        {page === "help" && <HelpPage seed={helpSeed} />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
