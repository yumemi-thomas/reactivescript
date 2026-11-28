import { useActorRef, useSelector } from "@xstate/react";
import { appMachine, type Page } from "./appMachine";
import { HelpPage } from "./HelpPage";
import { IssuesPage } from "./IssuesPage";
import { SettingsPage } from "./SettingsPage";

const TABS: { page: Page; label: string }[] = [
  { page: "issues", label: "Issues" },
  { page: "help", label: "Help" },
  { page: "settings", label: "Settings" },
];

export default function App() {
  const app = useActorRef(appMachine);
  const page = useSelector(app, s => s.value);
  const openCount = useSelector(app, s => s.context.openCount);
  const issues = useSelector(app, s => s.children.issues);
  const help = useSelector(app, s => s.children.help);
  const settings = useSelector(app, s => s.children.settings);

  return (
    <div className="desk">
      <nav className="tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.page}
            type="button"
            role="tab"
            aria-selected={page === tab.page}
            data-testid={`tab-${tab.page}`}
            onClick={() => app.send({ type: "OPEN", page: tab.page })}
          >
            {tab.page === "issues" && openCount !== null ? `${tab.label} (${openCount})` : tab.label}
          </button>
        ))}
      </nav>
      <main>
        {page === "issues" && issues && <IssuesPage key={issues.id + issues.sessionId} actor={issues} />}
        {page === "help" && help && <HelpPage key={help.sessionId} actor={help} />}
        {page === "settings" && settings && <SettingsPage key={settings.sessionId} actor={settings} />}
      </main>
    </div>
  );
}
