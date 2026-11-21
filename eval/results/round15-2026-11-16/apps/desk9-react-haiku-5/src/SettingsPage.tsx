import { useCallback, useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings } from "./api.js";
import type { Settings } from "./api.js";
import { errorMessage, type Load } from "./load";

const MAX_NAME = 20;

type Ready = {
  saved: Settings;
  draft: Settings;
  saving: Settings | null;
  saveError: string | null;
};

function nameProblem(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  if (name.length > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${name.length}`;
  return null;
}

function summary(s: Settings): string {
  return `${s.name} · ${s.theme} · ${s.density}`;
}

export default function SettingsPage() {
  const [state, setState] = useState<Load<Ready>>({ status: "loading" });
  const token = useRef(0);

  const request = useCallback(() => {
    const mine = ++token.current;
    loadSettings().then(
      (value) => {
        if (mine === token.current) {
          setState({ status: "ok", value: { saved: value, draft: value, saving: null, saveError: null } });
        }
      },
      (e: unknown) => {
        if (mine === token.current) setState({ status: "error", message: errorMessage(e) });
      },
    );
  }, []);

  useEffect(() => {
    request();
  }, [request]);

  function patch(fn: (r: Ready) => Ready) {
    setState((s): Load<Ready> => (s.status === "ok" ? { status: "ok", value: fn(s.value) } : s));
  }

  function edit(fn: (d: Settings) => Settings) {
    patch((r) => ({ ...r, draft: fn(r.draft) }));
  }

  function retry() {
    setState({ status: "loading" });
    request();
  }

  function save() {
    if (ready === null || ready.saving !== null) return;
    if (nameProblem(ready.draft.name) !== null) return;
    const toSave: Settings = { ...ready.draft, name: ready.draft.name.trim() };
    patch((r) => ({ ...r, saving: toSave, saveError: null }));
    saveSettings(toSave).then(
      (saved) => patch((r) => ({ ...r, saved, saving: null })),
      (e: unknown) => patch((r) => ({ ...r, saving: null, saveError: errorMessage(e) })),
    );
  }

  const ready = state.status === "ok" ? state.value : null;
  const problem = ready !== null ? nameProblem(ready.draft.name) : null;

  return (
    <section className="settings" aria-label="Settings">
      <p data-testid="load" role="status">
        {state.status === "loading" && "Loading settings…"}
        {state.status === "error" && (
          <>
            Could not load settings: {state.message}{" "}
            <button data-testid="retry-load" onClick={retry}>
              retry
            </button>
          </>
        )}
      </p>

      {ready !== null && (
        <>
          <p data-testid="saved" aria-live="polite">
            Saved: {summary(ready.saving ?? ready.saved)}
            {ready.saving !== null ? " (saving…)" : ""}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label>
              Display name{" "}
              <input
                data-testid="name"
                value={ready.draft.name}
                onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <span data-testid="name-count">
              {ready.draft.name.length}/{MAX_NAME}
            </span>
            {problem !== null && (
              <p data-testid="name-error" role="alert">
                {problem}
              </p>
            )}

            <div>
              <button
                type="button"
                data-testid="theme-light"
                aria-pressed={ready.draft.theme === "light"}
                onClick={() => edit((d) => ({ ...d, theme: "light" }))}
              >
                Light
              </button>
              <button
                type="button"
                data-testid="theme-dark"
                aria-pressed={ready.draft.theme === "dark"}
                onClick={() => edit((d) => ({ ...d, theme: "dark" }))}
              >
                Dark
              </button>
              <button
                type="button"
                data-testid="density-toggle"
                onClick={() =>
                  edit((d) => ({ ...d, density: d.density === "compact" ? "comfortable" : "compact" }))
                }
              >
                Density: {ready.draft.density}
              </button>
            </div>

            <p data-testid="preview">
              Preview: {ready.draft.theme} / {ready.draft.density}
            </p>

            <button type="submit" data-testid="save" disabled={ready.saving !== null}>
              Save
            </button>
            {ready.saveError !== null && (
              <p data-testid="save-error" role="alert">
                Save failed: {ready.saveError}
              </p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
