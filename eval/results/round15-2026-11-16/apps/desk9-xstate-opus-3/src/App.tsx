import { useMachine } from "@xstate/react";
import { appMachine, type Page } from "./appMachine";
import { HelpPage } from "./HelpPage";
import { IssuesPage } from "./IssuesPage";
import { SettingsPage } from "./SettingsPage";
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
            aria-selected={snapshot.matches(page)}
            data-testid={`tab-${page}`}
            onClick={() => send({ type: "tab", page })}
          >
            {page === "issues" && openCount !== null ? `${label} (${openCount})` : label}
          </button>
        ))}
      </nav>
      <main>
        {snapshot.matches("issues") && issues && <IssuesPage key={issues.sessionId} actor={issues} />}
        {snapshot.matches("help") && help && <HelpPage key={help.sessionId} actor={help} />}
        {snapshot.matches("settings") && settings && <SettingsPage key={settings.sessionId} actor={settings} />}
      </main>
    </div>
  );
}
