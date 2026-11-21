import { useSelector } from "@xstate/react";
import type { ActorRefFrom, SnapshotFrom } from "xstate";
import type { Settings } from "../api.js";
import { NAME_MAX, nameError, settingsMachine } from "../machines/settingsMachine";

type SettingsActor = ActorRefFrom<typeof settingsMachine>;
const identity = (s: SnapshotFrom<typeof settingsMachine>) => s;

const line = (s: Settings) => `${s.name} · ${s.theme} · ${s.density}`;

export function SettingsPage({ actor }: { actor: SettingsActor }) {
  const snapshot = useSelector(actor, identity);
  const ctx = snapshot.context;
  const send = actor.send;

  if (!snapshot.matches("loaded") || !ctx.saved) {
    return (
      <section className="panel" aria-label="Settings">
        <div data-testid="load" aria-live="polite">
          {snapshot.matches("failed") ? (
            <>
              <p className="error">{`Could not load settings: ${ctx.loadError}`}</p>
              <button type="button" data-testid="retry-load" onClick={() => send({ type: "load.retry" })}>
                retry
              </button>
            </>
          ) : (
            <p className="muted">Loading settings…</p>
          )}
        </div>
      </section>
    );
  }

  const { draft } = ctx;
  const latest = ctx.pending.at(-1);
  const error = nameError(draft.name);

  return (
    <section className="panel" aria-label="Settings">
      <p data-testid="saved" aria-live="polite">
        {latest ? `Saved: ${line(latest.settings)} (saving…)` : `Saved: ${line(ctx.saved)}`}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "save" });
        }}
      >
        <div className="field">
          <label htmlFor="settings-name">Display name</label>
          <input
            id="settings-name"
            data-testid="name"
            value={draft.name}
            aria-invalid={error !== null}
            aria-describedby="settings-name-count"
            onChange={(e) => send({ type: "name.change", value: e.target.value })}
          />
          <span id="settings-name-count" data-testid="name-count" className={error ? "error" : "muted"}>
            {`${draft.name.length}/${NAME_MAX}`}
          </span>
        </div>
        {error !== null && (
          <p className="error" data-testid="name-error" role="alert">
            {error}
          </p>
        )}
        <div className="field" role="group" aria-label="Theme">
          <button
            type="button"
            data-testid="theme-light"
            aria-pressed={draft.theme === "light"}
            className={draft.theme === "light" ? "pressed" : undefined}
            onClick={() => send({ type: "theme.set", theme: "light" })}
          >
            light
          </button>
          <button
            type="button"
            data-testid="theme-dark"
            aria-pressed={draft.theme === "dark"}
            className={draft.theme === "dark" ? "pressed" : undefined}
            onClick={() => send({ type: "theme.set", theme: "dark" })}
          >
            dark
          </button>
          <button type="button" data-testid="density-toggle" onClick={() => send({ type: "density.toggle" })}>
            {`density: ${draft.density}`}
          </button>
        </div>
        <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>
        <button type="submit" data-testid="save">
          save
        </button>
        {ctx.saveError !== null && (
          <p className="error" data-testid="save-error" role="alert">
            {ctx.saveError}
          </p>
        )}
      </form>
    </section>
  );
}
