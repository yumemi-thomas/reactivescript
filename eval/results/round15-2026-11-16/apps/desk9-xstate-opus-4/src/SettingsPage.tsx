import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { Settings } from "./api";
import { NAME_MAX, nameError, settingsMachine } from "./settingsMachine";

type SettingsActor = ActorRefFrom<typeof settingsMachine>;

const line = (s: Settings) => `${s.name} · ${s.theme} · ${s.density}`;

export function SettingsPage({ actor }: { actor: SettingsActor }) {
  const snapshot = useSelector(actor, s => s);
  const c = snapshot.context;
  const send = actor.send;

  if (snapshot.matches("loading")) {
    return (
      <section className="page settings-page" aria-label="Settings">
        <p data-testid="load" className="muted">
          Loading settings…
        </p>
      </section>
    );
  }
  if (snapshot.matches("failed")) {
    return (
      <section className="page settings-page" aria-label="Settings">
        <div data-testid="load" role="alert">
          <p className="error">Could not load settings: {c.loadError}</p>
          <button data-testid="retry-load" onClick={() => send({ type: "load.retry" })}>
            retry
          </button>
        </div>
      </section>
    );
  }

  const error = nameError(c.draft.name);
  return (
    <section className="page settings-page" aria-label="Settings">
      <p data-testid="saved" aria-live="polite">
        {c.saving ? `Saved: ${line(c.saving.settings)} (saving…)` : c.saved ? `Saved: ${line(c.saved)}` : ""}
      </p>
      {c.saveError !== null && (
        <p className="error" data-testid="save-error" role="alert">
          Save failed: {c.saveError}
        </p>
      )}
      <form
        className="settings-form"
        onSubmit={e => {
          e.preventDefault();
          send({ type: "save" });
        }}
      >
        <label className="field">
          <span>Display name</span>
          <input
            data-testid="name"
            value={c.draft.name}
            aria-invalid={error !== null}
            onChange={e => send({ type: "name.change", value: e.target.value })}
          />
        </label>
        <span data-testid="name-count" className="muted">
          {c.draft.name.length}/{NAME_MAX}
        </span>
        {error !== null && (
          <p data-testid="name-error" className="error">
            {error}
          </p>
        )}
        <div className="segmented" role="group" aria-label="Theme">
          <button
            type="button"
            data-testid="theme-light"
            aria-pressed={c.draft.theme === "light"}
            onClick={() => send({ type: "theme.set", theme: "light" })}
          >
            light
          </button>
          <button
            type="button"
            data-testid="theme-dark"
            aria-pressed={c.draft.theme === "dark"}
            onClick={() => send({ type: "theme.set", theme: "dark" })}
          >
            dark
          </button>
        </div>
        <button type="button" data-testid="density-toggle" onClick={() => send({ type: "density.toggle" })}>
          density: {c.draft.density}
        </button>
        <p data-testid="preview">
          Preview: {c.draft.theme} / {c.draft.density}
        </p>
        <button type="submit" data-testid="save">
          save
        </button>
      </form>
    </section>
  );
}
