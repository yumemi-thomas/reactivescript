import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { settingsMachine } from '../machines/settings.js';
import { NAME_MAX, nameProblem } from '../machines/settings.js';

export type SettingsActor = ActorRefFrom<typeof settingsMachine>;

export function SettingsPage({ actor }: { actor: SettingsActor }) {
  const snap = useSelector(actor, (s) => s);
  const c = snap.context;
  const ready = snap.matches('ready');
  const saving = snap.matches({ ready: 'saving' });
  const saved = saving ? c.pendingSave : c.saved;
  const problem = nameProblem(c.draft.name);

  return (
    <div>
      <p data-testid="load">
        {snap.matches('loading') && 'Loading settings…'}
        {snap.matches('failed') && `Could not load settings: ${c.loadError}`}
      </p>
      {snap.matches('failed') && (
        <button data-testid="retry-load" onClick={() => actor.send({ type: 'RETRY_LOAD' })}>
          retry
        </button>
      )}

      {ready && saved && (
        <p data-testid="saved">
          {`Saved: ${saved.name} · ${saved.theme} · ${saved.density}${saving ? ' (saving…)' : ''}`}
        </p>
      )}

      {ready && (
        <div>
          <label>
            Display name{' '}
            <input
              data-testid="name"
              value={c.draft.name}
              onChange={(e) => actor.send({ type: 'SET_NAME', value: e.target.value })}
            />
          </label>
          <span data-testid="name-count">{`${c.draft.name.length}/${NAME_MAX}`}</span>
          {problem !== undefined && <p data-testid="name-error">{problem}</p>}

          <div>
            <button data-testid="theme-light" onClick={() => actor.send({ type: 'SET_THEME', theme: 'light' })}>
              light
            </button>
            <button data-testid="theme-dark" onClick={() => actor.send({ type: 'SET_THEME', theme: 'dark' })}>
              dark
            </button>
            <button data-testid="density-toggle" onClick={() => actor.send({ type: 'TOGGLE_DENSITY' })}>
              {`density: ${c.draft.density}`}
            </button>
          </div>

          <p data-testid="preview">{`Preview: ${c.draft.theme} / ${c.draft.density}`}</p>

          <button data-testid="save" onClick={() => actor.send({ type: 'SAVE' })}>
            save
          </button>
          {c.saveError !== undefined && <p data-testid="save-error">{`Save failed: ${c.saveError}`}</p>}
        </div>
      )}
    </div>
  );
}
