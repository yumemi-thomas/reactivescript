import type { Dispatch } from "react";
import {
  nameProblem,
  retryLoadSettings,
  saveDraft,
  type SettingsAction,
  type SettingsState,
} from "./settings";

export function SettingsPage({ state, dispatch }: { state: SettingsState; dispatch: Dispatch<SettingsAction> }) {
  const { load, saved, draft, saving, saveError } = state;
  const problem = draft ? nameProblem(draft.name) : null;
  const shown = saving ? saving.values : saved;

  return (
    <section aria-label="Settings">
      <div data-testid="load">
        {load.status === "loading" && "Loading settings…"}
        {load.status === "error" && `Could not load settings: ${load.error ?? ""}`}
      </div>
      {load.status === "error" && (
        <button type="button" data-testid="retry-load" onClick={() => retryLoadSettings(dispatch)}>
          retry
        </button>
      )}

      {saved && draft && shown && (
        <>
          <p data-testid="saved">
            {`Saved: ${shown.name} · ${shown.theme} · ${shown.density}${saving ? " (saving…)" : ""}`}
          </p>

          <div>
            <label>
              Display name{" "}
              <input
                data-testid="name"
                value={draft.name}
                onChange={(e) => dispatch({ type: "setName", name: e.target.value })}
              />
            </label>
            <span data-testid="name-count">{`${draft.name.length}/20`}</span>
            {problem && <p data-testid="name-error">{problem}</p>}
          </div>

          <div>
            <button
              type="button"
              data-testid="theme-light"
              aria-pressed={draft.theme === "light"}
              onClick={() => dispatch({ type: "setTheme", theme: "light" })}
            >
              Light
            </button>
            <button
              type="button"
              data-testid="theme-dark"
              aria-pressed={draft.theme === "dark"}
              onClick={() => dispatch({ type: "setTheme", theme: "dark" })}
            >
              Dark
            </button>
            <button type="button" data-testid="density-toggle" onClick={() => dispatch({ type: "toggleDensity" })}>
              Density
            </button>
          </div>

          <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>

          <button
            type="button"
            data-testid="save"
            onClick={() => {
              if (!problem) saveDraft(dispatch, draft);
            }}
          >
            save
          </button>
          {saveError && <p data-testid="save-error">{`Save failed: ${saveError}`}</p>}
        </>
      )}
    </section>
  );
}
