import { useActorRef, useSelector } from '@xstate/react';
import { appMachine } from './machines/app.js';
import { HelpPage } from './pages/HelpPage.js';
import { IssuesPage } from './pages/IssuesPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export default function App() {
  const app = useActorRef(appMachine);
  const page = useSelector(app, (s) => s.value);
  const openCount = useSelector(app, (s) => s.context.openCount);
  const helpInput = useSelector(app, (s) => s.context.helpInput);

  return (
    <div className="app">
      <nav aria-label="Pages">
        <button
          data-testid="tab-issues"
          type="button"
          aria-current={page === 'issues' ? 'page' : undefined}
          onClick={() => app.send({ type: 'GO_ISSUES' })}
        >
          {openCount === null ? 'Issues' : `Issues (${openCount})`}
        </button>
        <button
          data-testid="tab-help"
          type="button"
          aria-current={page === 'help' ? 'page' : undefined}
          onClick={() => app.send({ type: 'GO_HELP' })}
        >
          Help
        </button>
        <button
          data-testid="tab-settings"
          type="button"
          aria-current={page === 'settings' ? 'page' : undefined}
          onClick={() => app.send({ type: 'GO_SETTINGS' })}
        >
          Settings
        </button>
      </nav>

      {page === 'issues' && <IssuesPage app={app} />}
      {page === 'help' && <HelpPage input={helpInput} />}
      {page === 'settings' && <SettingsPage />}
    </div>
  );
}
