import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { NAME_MAX, nameProblem } from '../machines/settings';
import type { settingsMachine } from '../machines/settings';

type SettingsRef = ActorRefFrom<typeof settingsMachine>;

export function SettingsPage({ actor }: { actor: SettingsRef }) {
  const snap = useSelector(actor, (s) => s);
  const { saved, draft, pending, loadError, saveError } = snap.context;
  const loading = snap.matches('loading');
  const loadFailed = snap.matches('loadFailed');
  const editing = snap.matches('editing');
  const saving = snap.matches({ editing: 'saving' });
  const problem = nameProblem(draft.name);

  return (
    <section aria-label="Settings" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <p data-testid="load" style={{ margin: 0 }}>
          {loading && 'Loading settings…'}
          {loadFailed && `Could not load settings: ${loadError ?? ''}`}
        </p>
        {loadFailed && (
          <button data-testid="retry-load" onClick={() => actor.send({ type: 'RETRY_LOAD' })}>
            retry
          </button>
        )}
      </div>

      {editing && (
        <>
          <p data-testid="saved" style={{ margin: 0 }}>
            {saving && pending
              ? `Saved: ${pending.name} · ${pending.theme} · ${pending.density} (saving…)`
              : `Saved: ${saved.name} · ${saved.theme} · ${saved.density}`}
          </p>
          {saveError !== null && <p data-testid="save-error">{`Save failed: ${saveError}`}</p>}

          <div>
            <label>
              Display name{' '}
              <input
                data-testid="name"
                value={draft.name}
                onChange={(e) => actor.send({ type: 'SET_NAME', value: e.target.value })}
              />
            </label>{' '}
            <span data-testid="name-count">{`${draft.name.length}/${NAME_MAX}`}</span>
            {problem !== null && <p data-testid="name-error">{problem}</p>}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              data-testid="theme-light"
              aria-pressed={draft.theme === 'light'}
              onClick={() => actor.send({ type: 'SET_THEME', theme: 'light' })}
            >
              light
            </button>
            <button
              data-testid="theme-dark"
              aria-pressed={draft.theme === 'dark'}
              onClick={() => actor.send({ type: 'SET_THEME', theme: 'dark' })}
            >
              dark
            </button>
            <button data-testid="density-toggle" onClick={() => actor.send({ type: 'TOGGLE_DENSITY' })}>
              {`density: ${draft.density}`}
            </button>
          </div>

          <p data-testid="preview" style={{ margin: 0 }}>
            {`Preview: ${draft.theme} / ${draft.density}`}
          </p>

          <div>
            <button data-testid="save" onClick={() => actor.send({ type: 'SAVE' })}>
              save
            </button>
          </div>
        </>
      )}
    </section>
  );
}
