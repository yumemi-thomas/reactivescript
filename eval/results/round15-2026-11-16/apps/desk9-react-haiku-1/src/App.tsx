import { useState } from "react";
import HelpPage, { type HelpSeed } from "./HelpPage";
import IssuesPage from "./IssuesPage";
import SettingsPage from "./SettingsPage";

type Page = "issues" | "help" | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("issues");
  const [seed, setSeed] = useState<HelpSeed | null>(null);
  /** the open-issue count outlives the issues page, so it lives here */
  const [openCount, setOpenCount] = useState<number | null>(null);

  // Leaving a page discards it: switching pages remounts the next one from its start.
  const go = (next: Page) => {
    if (next === page) return;
    setSeed(null);
    setPage(next);
  };

  const openHelp = (query: string, hitId: number) => {
    setSeed({ query, hitId });
    setPage("help");
  };

  return (
    <>
      <nav>
        <button type="button" data-testid="tab-issues" aria-current={page === "issues"} onClick={() => go("issues")}>
          {openCount === null ? "Issues" : `Issues (${openCount})`}
        </button>
        <button type="button" data-testid="tab-help" aria-current={page === "help"} onClick={() => go("help")}>
          Help
        </button>
        <button type="button" data-testid="tab-settings" aria-current={page === "settings"} onClick={() => go("settings")}>
          Settings
        </button>
      </nav>
      <main>
        {page === "issues" ? <IssuesPage setOpenCount={setOpenCount} onOpenHelp={openHelp} /> : null}
        {page === "help" ? <HelpPage seed={seed} /> : null}
        {page === "settings" ? <SettingsPage /> : null}
      </main>
    </>
  );
}
