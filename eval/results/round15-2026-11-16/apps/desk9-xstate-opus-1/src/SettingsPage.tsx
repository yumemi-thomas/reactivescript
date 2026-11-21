import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { NAME_MAX, nameError, nameLength, savedLine, settingsMachine } from "./settingsMachine";

export function SettingsPage({ actor }: { actor: ActorRefFrom<typeof settingsMachine> }) {
  const state = useSelector(actor, s => s);
  const ctx = state.context;
  const send = actor.send;

  if (state.matches("loading")) {
    return (
      <section className="settings">
        <p data-testid="load">Loading settings…</p>
      </section>
    );
  }
  if (state.matches("failed")) {
    return (
      <section className="settings">
        <div data-testid="load">
          <p className="error">Could not load settings: {ctx.loadError}</p>
          <button type="button" data-testid="retry-load" onClick={() => send({ type: "RETRY_LOAD" })}>
            retry
          </button>
        </div>
      </section>
    );
  }

  const line = savedLine(ctx);
  const draft = ctx.draft;
  const error = nameError(draft.name);

  return (
    <section className={`settings theme-${draft.theme} density-${draft.density}`}>
      {line && (
        <p data-testid="saved">
          Saved: {line.settings.name} · {line.settings.theme} · {line.settings.density}
          {line.saving ? " (saving…)" : ""}
        </p>
      )}
      <form
        onSubmit={e => {
          e.preventDefault();
          send({ type: "SAVE" });
        }}
      >
        <label>
          Display name{" "}
          <input
            data-testid="name"
            value={draft.name}
            aria-invalid={error !== null}
            onChange={e => send({ type: "NAME", value: e.target.value })}
          />
        </label>
        <span data-testid="name-count">
          {nameLength(draft.name)}/{NAME_MAX}
        </span>
        {error !== null && (
          <p className="error" data-testid="name-error">
            {error}
          </p>
        )}
        <div className="choices">
          <button type="button" data-testid="theme-light" aria-pressed={draft.theme === "light"} onClick={() => send({ type: "THEME", theme: "light" })}>
            light
          </button>
          <button type="button" data-testid="theme-dark" aria-pressed={draft.theme === "dark"} onClick={() => send({ type: "THEME", theme: "dark" })}>
            dark
          </button>
          <button type="button" data-testid="density-toggle" onClick={() => send({ type: "TOGGLE_DENSITY" })}>
            density: {draft.density}
          </button>
        </div>
        <p data-testid="preview">
          Preview: {draft.theme} / {draft.density}
        </p>
        <button type="submit" data-testid="save">
          save
        </button>
        {ctx.saveError !== null && (
          <p className="error" data-testid="save-error">
            Save failed: {ctx.saveError}
          </p>
        )}
      </form>
    </section>
  );
}
