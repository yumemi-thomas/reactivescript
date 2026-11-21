import { useMachine, useSelector } from "@xstate/react";
import { appMachine } from "./machines/app";
import { viewIssues } from "./model";
import { IssuesPage } from "./components/IssuesPage";
import { HelpPage } from "./components/HelpPage";
import { SettingsPage } from "./components/SettingsPage";
import { styles } from "./styles";
import type { ActorRefFrom } from "xstate";

type AppRef = ActorRefFrom<typeof appMachine>;

function IssuesTabLabel({ appRef }: { appRef: AppRef }) {
  const count = useSelector(appRef, (s) => {
    const base = s.context.openBase;
    if (!base) return null;
    return viewIssues(base.items, base.at, "open", s.context.confirmed, s.context.pending).length;
  });
  return <>{count === null ? "Issues" : `Issues (${count})`}</>;
}

export default function App() {
  const [snapshot, send, appRef] = useMachine(appMachine);
  const page = snapshot.matches("help") ? "help" : snapshot.matches("settings") ? "settings" : "issues";
  const issuesRef = snapshot.children.issuesPage;
  const helpRef = snapshot.children.help;
  const settingsRef = snapshot.children.settings;

  return (
    <div className="desk">
      <style>{styles}</style>
      <nav className="tabs" role="tablist" aria-label="Pages">
        <button
          type="button"
          role="tab"
          aria-selected={page === "issues"}
          data-testid="tab-issues"
          onClick={() => send({ type: "tab.issues" })}
        >
          <IssuesTabLabel appRef={appRef} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={page === "help"}
          data-testid="tab-help"
          onClick={() => send({ type: "tab.help" })}
        >
          Help
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={page === "settings"}
          data-testid="tab-settings"
          onClick={() => send({ type: "tab.settings" })}
        >
          Settings
        </button>
      </nav>
      <main className="page">
        {page === "issues" && issuesRef && <IssuesPage key={issuesRef.sessionId} appRef={appRef} pageRef={issuesRef} />}
        {page === "help" && helpRef && <HelpPage key={helpRef.sessionId} helpRef={helpRef} />}
        {page === "settings" && settingsRef && <SettingsPage key={settingsRef.sessionId} settingsRef={settingsRef} />}
      </main>
    </div>
  );
}
