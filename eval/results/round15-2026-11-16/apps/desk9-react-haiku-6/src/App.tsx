import { useState } from "react";
import HelpPage from "./HelpPage";
import type { HelpSeed } from "./HelpPage";
import IssuesPage from "./IssuesPage";
import SettingsPage from "./SettingsPage";

type Page = "issues" | "help" | "settings";

interface View {
  page: Page;
  seed: HelpSeed | null;
}

export default function App() {
  const [view, setView] = useState<View>({ page: "issues", seed: null });
  const [openCount, setOpenCount] = useState<number | null>(null);

  // Switching pages mounts the new page fresh; the old one is discarded.
  const show = (page: Page) => {
    if (page !== view.page) setView({ page, seed: null });
  };
  const openRelatedHelp = (seed: HelpSeed) => setView({ page: "help", seed });

  return (
    <div>
      <nav aria-label="Pages">
        <button
          type="button"
          data-testid="tab-issues"
          aria-current={view.page === "issues" ? "page" : undefined}
          onClick={() => show("issues")}
        >
          {openCount === null ? "Issues" : `Issues (${openCount})`}
        </button>
        <button
          type="button"
          data-testid="tab-help"
          aria-current={view.page === "help" ? "page" : undefined}
          onClick={() => show("help")}
        >
          Help
        </button>
        <button
          type="button"
          data-testid="tab-settings"
          aria-current={view.page === "settings" ? "page" : undefined}
          onClick={() => show("settings")}
        >
          Settings
        </button>
      </nav>

      {view.page === "issues" && <IssuesPage onOpenCount={setOpenCount} onOpenHelp={openRelatedHelp} />}
      {view.page === "help" && <HelpPage seed={view.seed} />}
      {view.page === "settings" && <SettingsPage />}
    </div>
  );
}
