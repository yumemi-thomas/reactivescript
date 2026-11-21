import { useMachine } from "@xstate/react";
import { appMachine, type Page } from "./machines/appMachine";
import { IssuesPage } from "./pages/IssuesPage";
import { HelpPage } from "./pages/HelpPage";
import { SettingsPage } from "./pages/SettingsPage";
import { styles } from "./styles";

const TABS: { page: Page; label: string }[] = [
  { page: "issues", label: "Issues" },
  { page: "help", label: "Help" },
  { page: "settings", label: "Settings" },
];

export default function App() {
  const [snapshot, send] = useMachine(appMachine);
  const { openCount } = snapshot.context;
  const { issues, help, settings } = snapshot.children;

  return (
    <div className="desk">
      <style>{styles}</style>
      <nav className="tabs" role="tablist" aria-label="Pages">
        {TABS.map(({ page, label }) => (
          <button
            key={page}
            type="button"
            role="tab"
            data-testid={`tab-${page}`}
            aria-selected={snapshot.matches(page)}
            className={snapshot.matches(page) ? "tab active" : "tab"}
            onClick={() => send({ type: "tab", page })}
          >
            {page === "issues" && openCount !== null ? `${label} (${openCount})` : label}
          </button>
        ))}
      </nav>
      <main className="page">
        {snapshot.matches("issues") && issues && <IssuesPage key={issues.sessionId} actor={issues} />}
        {snapshot.matches("help") && help && <HelpPage key={help.sessionId} actor={help} />}
        {snapshot.matches("settings") && settings && <SettingsPage key={settings.sessionId} actor={settings} />}
      </main>
    </div>
  );
}
