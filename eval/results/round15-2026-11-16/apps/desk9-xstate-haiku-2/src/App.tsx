import { useActorRef, useSelector } from "@xstate/react";
import "./styles.css";
import { appMachine } from "./machines/app.js";
import { IssuesPage, type IssuesRef } from "./pages/IssuesPage.js";
import { HelpPage, type HelpRef } from "./pages/HelpPage.js";
import { SettingsPage, type SettingsRef } from "./pages/SettingsPage.js";

export default function App() {
  const app = useActorRef(appMachine);
  const page = useSelector(app, (s) => String(s.value));
  const openCount = useSelector(app, (s) => s.context.openCount);
  const issues = useSelector(app, (s) => s.children.issues) as unknown as IssuesRef | undefined;
  const help = useSelector(app, (s) => s.children.help) as unknown as HelpRef | undefined;
  const settings = useSelector(app, (s) => s.children.settings) as unknown as SettingsRef | undefined;

  return (
    <div className="app">
      <nav className="tabs" aria-label="Pages">
        <button data-testid="tab-issues" aria-current={page === "issues"} onClick={() => app.send({ type: "tab.issues" })}>
          {openCount === null ? "Issues" : `Issues (${openCount})`}
        </button>
        <button data-testid="tab-help" aria-current={page === "help"} onClick={() => app.send({ type: "tab.help" })}>
          Help
        </button>
        <button data-testid="tab-settings" aria-current={page === "settings"} onClick={() => app.send({ type: "tab.settings" })}>
          Settings
        </button>
      </nav>
      <main>
        {page === "issues" && issues && <IssuesPage actor={issues} />}
        {page === "help" && help && <HelpPage actor={help} />}
        {page === "settings" && settings && <SettingsPage actor={settings} />}
      </main>
    </div>
  );
}
