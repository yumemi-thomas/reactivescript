import { useActorRef, useSelector } from '@xstate/react';
import type { Settings } from '../api.js';
import { NAME_MAX, nameError, settingsMachine } from '../machines/settings.js';

function describe(s: Settings): string {
  return `${s.name} · ${s.theme} · ${s.density}`;
}

export function SettingsPage() {
  const settings = useActorRef(settingsMachine);
  const snap = useSelector(settings, (s) => s);
  const ctx = snap.context;
  const send = settings.send;

  const loading = snap.matches('loading');
  const failed = snap.matches('failed');
  const ready = snap.matches({ ready: 'idle' }) || snap.matches({ ready: 'saving' });
  const draft = ctx.draft;
  const error = nameError(draft.name);

  return (
    <section aria-label="Settings">
      <div data-testid="load">
        {loading && <p>Loading settings…</p>}
        {failed && (
          <>
            <p>{`Could not load settings: ${ctx.loadError}`}</p>
            <button data-testid="retry-load" type="button" onClick={() => send({ type: 'RETRY_LOAD' })}>
              retry
            </button>
          </>
        )}
      </div>

      {ready && ctx.saved !== null && (
        <>
          <p data-testid="saved">
            {ctx.inFlight !== null ? `Saved: ${describe(ctx.inFlight)} (saving…)` : `Saved: ${describe(ctx.saved)}`}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send({ type: 'SAVE' });
            }}
          >
            <label>
              Display name{' '}
              <input
                data-testid="name"
                value={draft.name}
                onChange={(e) => send({ type: 'NAME', value: e.target.value })}
              />
            </label>
            <span data-testid="name-count">{`${draft.name.length}/${NAME_MAX}`}</span>
            {error !== null && <p data-testid="name-error">{error}</p>}

            <div>
              <button
                data-testid="theme-light"
                type="button"
                aria-pressed={draft.theme === 'light'}
                onClick={() => send({ type: 'THEME', theme: 'light' })}
              >
                Light
              </button>
              <button
                data-testid="theme-dark"
                type="button"
                aria-pressed={draft.theme === 'dark'}
                onClick={() => send({ type: 'THEME', theme: 'dark' })}
              >
                Dark
              </button>
              <button data-testid="density-toggle" type="button" onClick={() => send({ type: 'TOGGLE_DENSITY' })}>
                {`Density: ${draft.density}`}
              </button>
            </div>

            <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>

            <button data-testid="save" type="submit">
              Save
            </button>
            {ctx.saveError !== '' && <p data-testid="save-error">{`Save failed: ${ctx.saveError}`}</p>}
          </form>
        </>
      )}
    </section>
  );
}
