import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { NAME_MAX, nameError, savedLine, type settingsMachine } from "../machines/settings";

type SettingsActor = ActorRefFrom<typeof settingsMachine>;

export function SettingsPage({ actor }: { actor: SettingsActor }) {
  const snapshot = useSelector(actor, s => s);
  const { context } = snapshot;
  const { send } = actor;

  if (snapshot.matches("loading")) {
    return (
      <section className="panel">
        <p data-testid="load" className="muted">
          Loading settings…
        </p>
      </section>
    );
  }
  if (snapshot.matches("failed")) {
    return (
      <section className="panel">
        <p data-testid="load" className="error">
          Could not load settings: {context.loadError}{" "}
          <button type="button" data-testid="retry-load" onClick={() => send({ type: "load.retry" })}>
            retry
          </button>
        </p>
      </section>
    );
  }

  const { draft } = context;
  const line = savedLine(context);
  const error = nameError(draft.name);
  return (
    <section className="panel">
      {line && (
        <p data-testid="saved">
          {`Saved: ${line.settings.name} · ${line.settings.theme} · ${line.settings.density}${line.saving ? " (saving…)" : ""}`}
        </p>
      )}
      <form
        onSubmit={e => {
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
            onChange={e => send({ type: "name.change", value: e.target.value })}
          />
          <span data-testid="name-count" className="muted">
            {`${draft.name.length}/${NAME_MAX}`}
          </span>
          {error !== null && (
            <span data-testid="name-error" className="error">
              {error}
            </span>
          )}
        </div>
        <div className="form-row">
          <button
            type="button"
            data-testid="theme-light"
            aria-pressed={draft.theme === "light"}
            onClick={() => send({ type: "theme.set", theme: "light" })}
          >
            light
          </button>
          <button
            type="button"
            data-testid="theme-dark"
            aria-pressed={draft.theme === "dark"}
            onClick={() => send({ type: "theme.set", theme: "dark" })}
          >
            dark
          </button>
          <button type="button" data-testid="density-toggle" onClick={() => send({ type: "density.toggle" })}>
            density: {draft.density}
          </button>
        </div>
        <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>
        <button type="submit" data-testid="save">
          save
        </button>
        {context.saveError !== null && (
          <p data-testid="save-error" className="error" role="alert">
            Save failed: {context.saveError}
          </p>
        )}
      </form>
    </section>
  );
}
