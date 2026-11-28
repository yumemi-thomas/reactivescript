import { useMachine } from "@xstate/react";
import { appMachine } from "./appMachine";
import { HelpPage } from "./HelpPage";
import { IssuesPage } from "./IssuesPage";
import { SettingsPage } from "./SettingsPage";
import "./styles.css";

export default function App() {
  const [state, send] = useMachine(appMachine);
  const { openCount } = state.context;
  const { issues, help, settings } = state.children;

  return (
    <div className="app">
      <nav className="tabs" role="tablist" aria-label="Pages">
        <button
          role="tab"
          data-testid="tab-issues"
          aria-selected={state.matches("issues")}
          onClick={() => send({ type: "tab.issues" })}
        >
          {openCount === null ? "Issues" : `Issues (${openCount})`}
        </button>
        <button
          role="tab"
          data-testid="tab-help"
          aria-selected={state.matches("help")}
          onClick={() => send({ type: "tab.help" })}
        >
          Help
        </button>
        <button
          role="tab"
          data-testid="tab-settings"
          aria-selected={state.matches("settings")}
          onClick={() => send({ type: "tab.settings" })}
        >
          Settings
        </button>
      </nav>
      <main>
        {state.matches("issues") && issues && <IssuesPage key={issues.sessionId} actor={issues} />}
        {state.matches("help") && help && <HelpPage key={help.sessionId} actor={help} />}
        {state.matches("settings") && settings && <SettingsPage key={settings.sessionId} actor={settings} />}
      </main>
    </div>
  );
}
