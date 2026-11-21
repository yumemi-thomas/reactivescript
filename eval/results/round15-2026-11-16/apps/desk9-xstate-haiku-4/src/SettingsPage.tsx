import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { Settings } from "./api.js";
import { MAX_NAME_LENGTH, nameProblem } from "./settingsMachine";
import type { settingsMachine } from "./settingsMachine";

type SettingsRef = ActorRefFrom<typeof settingsMachine>;

const describe = (s: Settings) => `${s.name} · ${s.theme} · ${s.density}`;

export function SettingsPage({ actor }: { actor: SettingsRef }) {
  const snap = useSelector(actor, (s) => s);
  const c = snap.context;
  const saving = snap.matches({ editing: "saving" });
  const draft = c.draft;
  const problem = draft ? nameProblem(draft.name) : null;

  return (
    <div className="settings-page">
      <section data-testid="load" aria-live="polite">
        {snap.matches("loading") && "Loading settings…"}
        {snap.matches("loadFailed") && (
          <>
            <span>{`Could not load settings: ${c.loadError}`}</span>{" "}
            <button type="button" data-testid="retry-load" onClick={() => actor.send({ type: "RETRY_LOAD" })}>
              retry
            </button>
          </>
        )}
      </section>

      {c.saved && (
        <p data-testid="saved">
          {saving && c.saving ? `Saved: ${describe(c.saving)} (saving…)` : `Saved: ${describe(c.saved)}`}
        </p>
      )}

      {draft && snap.matches("editing") && (
        <form className="draft" onSubmit={(e) => e.preventDefault()}>
          <label>
            Display name{" "}
            <input
              data-testid="name"
              value={draft.name}
              onChange={(e) => actor.send({ type: "SET_NAME", name: e.target.value })}
            />
          </label>
          <span data-testid="name-count">{`${draft.name.length}/${MAX_NAME_LENGTH}`}</span>
          {problem && <p data-testid="name-error">{problem}</p>}

          <div role="group" aria-label="Theme">
            <button
              type="button"
              data-testid="theme-light"
              aria-pressed={draft.theme === "light"}
              onClick={() => actor.send({ type: "SET_THEME", theme: "light" })}
            >
              Light
            </button>
            <button
              type="button"
              data-testid="theme-dark"
              aria-pressed={draft.theme === "dark"}
              onClick={() => actor.send({ type: "SET_THEME", theme: "dark" })}
            >
              Dark
            </button>
          </div>
          <button type="button" data-testid="density-toggle" onClick={() => actor.send({ type: "TOGGLE_DENSITY" })}>
            {`Density: ${draft.density}`}
          </button>
          <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>

          <button type="button" data-testid="save" onClick={() => actor.send({ type: "SAVE" })}>
            Save
          </button>
          {c.saveError && <p data-testid="save-error">{`Save failed: ${c.saveError}`}</p>}
        </form>
      )}
    </div>
  );
}
