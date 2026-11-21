import { useState } from "react";
import IssuesPage from "./IssuesPage";
import HelpPage, { type HelpSeed } from "./HelpPage";
import SettingsPage from "./SettingsPage";

type Page = "issues" | "help" | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("issues");
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [helpSeed, setHelpSeed] = useState<HelpSeed | null>(null);

  function openTab(p: Page) {
    if (p === page) return;
    setHelpSeed(null);
    setPage(p);
  }

  function openRelated(seed: HelpSeed) {
    setHelpSeed(seed);
    setPage("help");
  }

  return (
    <div className="app">
      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={page === "issues"}
          data-testid="tab-issues"
          onClick={() => openTab("issues")}
        >
          {openCount === null ? "Issues" : `Issues (${openCount})`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={page === "help"}
          data-testid="tab-help"
          onClick={() => openTab("help")}
        >
          Help
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={page === "settings"}
          data-testid="tab-settings"
          onClick={() => openTab("settings")}
        >
          Settings
        </button>
      </nav>
      <main>
        {page === "issues" && <IssuesPage onOpenCount={setOpenCount} onOpenHelp={openRelated} />}
        {page === "help" && <HelpPage seed={helpSeed} />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
