import { useMachine } from '@xstate/react';
import { appMachine } from './machines/app.js';
import { HelpPage, type HelpActor } from './pages/HelpPage.js';
import { IssuesPage, type IssuesActor } from './pages/IssuesPage.js';
import { SettingsPage, type SettingsActor } from './pages/SettingsPage.js';

export default function App() {
  const [snap, send] = useMachine(appMachine);
  const count = snap.context.openCount;
  const issues = snap.children.issuesPage as IssuesActor | undefined;
  const help = snap.children.helpPage as HelpActor | undefined;
  const settings = snap.children.settingsPage as SettingsActor | undefined;

  return (
    <main>
      <nav>
        <button data-testid="tab-issues" onClick={() => send({ type: 'GO_ISSUES' })}>
          {count === undefined ? 'Issues' : `Issues (${count})`}
        </button>
        <button data-testid="tab-help" onClick={() => send({ type: 'GO_HELP' })}>
          Help
        </button>
        <button data-testid="tab-settings" onClick={() => send({ type: 'GO_SETTINGS' })}>
          Settings
        </button>
      </nav>

      {snap.matches('issues') && issues && <IssuesPage actor={issues} />}
      {snap.matches('help') && help && <HelpPage actor={help} />}
      {snap.matches('settings') && settings && <SettingsPage actor={settings} />}
    </main>
  );
}
