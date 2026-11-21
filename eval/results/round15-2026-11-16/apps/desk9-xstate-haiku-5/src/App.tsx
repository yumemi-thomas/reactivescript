import { useMachine } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { deskMachine } from './machines/desk';
import type { helpMachine } from './machines/help';
import type { issuesMachine } from './machines/issues';
import type { settingsMachine } from './machines/settings';
import { HelpPage } from './pages/HelpPage';
import { IssuesPage } from './pages/IssuesPage';
import { SettingsPage } from './pages/SettingsPage';

type IssuesRef = ActorRefFrom<typeof issuesMachine>;
type HelpRef = ActorRefFrom<typeof helpMachine>;
type SettingsRef = ActorRefFrom<typeof settingsMachine>;

const tabStyle = { minWidth: 110, padding: '6px 12px' } as const;

export default function App() {
  const [snap, send] = useMachine(deskMachine);
  const { openCount } = snap.context;
  const issues = snap.children.issues as IssuesRef | undefined;
  const help = snap.children.help as HelpRef | undefined;
  const settings = snap.children.settings as SettingsRef | undefined;
  const issuesTab = openCount === undefined ? 'Issues' : `Issues (${openCount})`;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 22, margin: '8px 0 16px' }}>Issue desk</h1>
      <nav aria-label="Pages" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <button
          data-testid="tab-issues"
          style={tabStyle}
          aria-current={snap.matches('issues') ? 'page' : undefined}
          onClick={() => send({ type: 'GO_ISSUES' })}
        >
          {issuesTab}
        </button>
        <button
          data-testid="tab-help"
          style={tabStyle}
          aria-current={snap.matches('help') ? 'page' : undefined}
          onClick={() => send({ type: 'GO_HELP' })}
        >
          Help
        </button>
        <button
          data-testid="tab-settings"
          style={tabStyle}
          aria-current={snap.matches('settings') ? 'page' : undefined}
          onClick={() => send({ type: 'GO_SETTINGS' })}
        >
          Settings
        </button>
      </nav>
      <main>
        {snap.matches('issues') && issues && <IssuesPage actor={issues} />}
        {snap.matches('help') && help && <HelpPage actor={help} />}
        {snap.matches('settings') && settings && <SettingsPage actor={settings} />}
      </main>
    </div>
  );
}
