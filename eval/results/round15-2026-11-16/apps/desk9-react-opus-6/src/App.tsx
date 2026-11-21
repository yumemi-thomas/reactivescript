import { useCallback, useState } from "react";
import type { Hit } from "./api.js";
import IssuesPage from "./IssuesPage";
import HelpPage from "./HelpPage";
import SettingsPage from "./SettingsPage";
import { STYLES } from "./styles";

type Tab = "issues" | "help" | "settings";
type Page = { tab: "issues" } | { tab: "help"; query: string; hit: Hit | null } | { tab: "settings" };

export default function App() {
  const [page, setPage] = useState<Page>({ tab: "issues" });
  const [visit, setVisit] = useState(0);
  const [openCount, setOpenCount] = useState<number | null>(null);

  const go = (next: Page) => {
    setPage(next);
    setVisit(v => v + 1);
  };

  const openTab = (tab: Tab) => {
    if (tab === page.tab) return;
    if (tab === "help") go({ tab: "help", query: "", hit: null });
    else go({ tab });
  };

  const openRelated = useCallback((query: string, hit: Hit) => {
    setPage({ tab: "help", query, hit });
    setVisit(v => v + 1);
  }, []);

  const tabs: { tab: Tab; label: string }[] = [
    { tab: "issues", label: openCount === null ? "Issues" : `Issues (${openCount})` },
    { tab: "help", label: "Help" },
    { tab: "settings", label: "Settings" },
  ];

  return (
    <div className="desk">
      <style>{STYLES}</style>
      <nav className="tabs" role="tablist">
        {tabs.map(t => (
          <button
            key={t.tab}
            type="button"
            role="tab"
            aria-selected={page.tab === t.tab}
            className={page.tab === t.tab ? "tab active" : "tab"}
            data-testid={`tab-${t.tab}`}
            onClick={() => openTab(t.tab)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        {page.tab === "issues" && <IssuesPage key={visit} onOpenCount={setOpenCount} onOpenRelated={openRelated} />}
        {page.tab === "help" && <HelpPage key={visit} initialQuery={page.query} initialHit={page.hit} />}
        {page.tab === "settings" && <SettingsPage key={visit} />}
      </main>
    </div>
  );
}
