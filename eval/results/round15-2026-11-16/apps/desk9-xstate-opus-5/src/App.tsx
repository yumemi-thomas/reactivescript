import { useMachine } from "@xstate/react";
import { appMachine, type Page } from "./machines/app";
import { IssuesPage } from "./pages/IssuesPage";
import { HelpPage } from "./pages/HelpPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./styles.css";

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
      <nav className="tabs" role="tablist">
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
        {snapshot.matches("issues") && issues && <IssuesPage key={issues.id} actor={issues} />}
        {snapshot.matches("help") && help && <HelpPage key={help.id} actor={help} />}
        {snapshot.matches("settings") && settings && <SettingsPage key={settings.id} actor={settings} />}
      </main>
    </div>
  );
}
