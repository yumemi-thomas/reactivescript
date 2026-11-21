import { useState, useSyncExternalStore } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createDesk } from "./desk";
import { IssuesPage } from "./IssuesPage";
import { HelpPage } from "./HelpPage";
import type { HelpIntent } from "./HelpPage";
import { SettingsPage } from "./SettingsPage";

type Page = "issues" | "help" | "settings";

export default function App() {
  const [desk] = useState(createDesk);
  const [page, setPage] = useState<Page>("issues");
  const [helpIntent, setHelpIntent] = useState<HelpIntent | undefined>(undefined);
  const openCount = useSyncExternalStore(desk.open.subscribe, desk.open.count);

  const go = (next: Page) => {
    if (next === page) return;
    setHelpIntent(undefined);
    setPage(next);
  };

  const openHelp = (query: string, hitId: number) => {
    setHelpIntent({ query, hitId });
    setPage("help");
  };

  const tab = (next: Page, testId: string, label: string) => (
    <button
      type="button"
      data-testid={testId}
      aria-current={page === next ? "page" : undefined}
      onClick={() => go(next)}
    >
      {label}
    </button>
  );

  return (
    <QueryClientProvider client={desk.qc}>
      <nav aria-label="Pages" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {tab(
          "issues",
          "tab-issues",
          openCount === null ? "Issues" : `Issues (${openCount})`,
        )}
        {tab("help", "tab-help", "Help")}
        {tab("settings", "tab-settings", "Settings")}
      </nav>
      <main>
        {page === "issues" && <IssuesPage desk={desk} onOpenHelp={openHelp} />}
        {page === "help" && <HelpPage intent={helpIntent} />}
        {page === "settings" && <SettingsPage />}
      </main>
    </QueryClientProvider>
  );
}
