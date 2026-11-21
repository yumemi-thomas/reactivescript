import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { NAME_MAX, nameError, type settingsMachine } from "../machines/settings";
import type { Settings } from "../types";

type Props = { settingsRef: ActorRefFrom<typeof settingsMachine> };

const line = (s: Settings) => `${s.name} · ${s.theme} · ${s.density}`;

export function SettingsPage({ settingsRef }: Props) {
  const ctx = useSelector(settingsRef, (s) => s.context);
  const state = useSelector(settingsRef, (s) =>
    s.matches("loaded") ? "loaded" : s.matches("failed") ? "failed" : "loading",
  );

  if (state !== "loaded" || ctx.saved === null) {
    return (
      <div className="settings">
        <div data-testid="load" aria-live="polite">
          {state === "loading" && <p className="muted">Loading settings…</p>}
          {state === "failed" && (
            <>
              <p className="error" role="alert">
                Could not load settings: {ctx.loadError}
              </p>
              <button type="button" data-testid="retry-load" onClick={() => settingsRef.send({ type: "load.retry" })}>
                retry
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const { draft, saving } = ctx;
  const error = nameError(draft.name);

  return (
    <div className="settings">
      <p data-testid="saved" aria-live="polite">
        {saving ? `Saved: ${line(saving.settings)} (saving…)` : `Saved: ${line(ctx.saved)}`}
      </p>
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          settingsRef.send({ type: "save" });
        }}
      >
        <label className="field">
          <span>Display name</span>
          <input
            data-testid="name"
            value={draft.name}
            aria-invalid={error !== null}
            onChange={(e) => settingsRef.send({ type: "name.change", value: e.target.value })}
          />
        </label>
        <span data-testid="name-count" className="muted">
          {draft.name.length}/{NAME_MAX}
        </span>
        {error !== null && (
          <p data-testid="name-error" className="error" role="alert">
            {error}
          </p>
        )}
        <div className="segmented" role="group" aria-label="Theme">
          <button
            type="button"
            data-testid="theme-light"
            aria-pressed={draft.theme === "light"}
            onClick={() => settingsRef.send({ type: "theme.set", theme: "light" })}
          >
            light
          </button>
          <button
            type="button"
            data-testid="theme-dark"
            aria-pressed={draft.theme === "dark"}
            onClick={() => settingsRef.send({ type: "theme.set", theme: "dark" })}
          >
            dark
          </button>
        </div>
        <button type="button" data-testid="density-toggle" onClick={() => settingsRef.send({ type: "density.toggle" })}>
          density: {draft.density}
        </button>
        <p data-testid="preview" className={`preview ${draft.theme} ${draft.density}`}>
          Preview: {draft.theme} / {draft.density}
        </p>
        <button type="submit" data-testid="save">
          save
        </button>
        {ctx.saveError !== null && (
          <p data-testid="save-error" className="error" role="alert">
            Save failed: {ctx.saveError}
          </p>
        )}
      </form>
    </div>
  );
}
