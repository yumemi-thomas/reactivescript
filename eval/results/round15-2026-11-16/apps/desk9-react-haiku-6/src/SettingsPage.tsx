import { useEffect, useReducer, useRef } from "react";
import { loadSettings, saveSettings } from "./api.js";
import type { Density, Settings, Theme } from "./api.js";
import { messageOf } from "./errors";

interface State {
  attempt: number;
  loadError: string | null;
  saved: Settings | null;
  savedSeq: number;
  draft: Settings | null;
  saving: { seq: number; values: Settings } | null;
  saveError: string | null;
}

type Action =
  | { type: "loaded"; settings: Settings }
  | { type: "load-failed"; message: string }
  | { type: "retry-load" }
  | { type: "name"; name: string }
  | { type: "theme"; theme: Theme }
  | { type: "density-toggle" }
  | { type: "save-start"; seq: number; values: Settings }
  | { type: "save-ok"; seq: number; settings: Settings }
  | { type: "save-fail"; seq: number; message: string };

const NAME_MAX = 20;

function nameProblem(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  if (name.length > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  return null;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { ...state, loadError: null, saved: action.settings, draft: action.settings };
    case "load-failed":
      return { ...state, loadError: action.message };
    case "retry-load":
      return { ...state, loadError: null, attempt: state.attempt + 1 };
    case "name":
      return state.draft === null ? state : { ...state, draft: { ...state.draft, name: action.name } };
    case "theme":
      return state.draft === null ? state : { ...state, draft: { ...state.draft, theme: action.theme } };
    case "density-toggle":
      if (state.draft === null) return state;
      return {
        ...state,
        draft: {
          ...state.draft,
          density: state.draft.density === "compact" ? "comfortable" : "compact",
        },
      };
    case "save-start":
      return { ...state, saving: { seq: action.seq, values: action.values }, saveError: null };
    case "save-ok": {
      const saving = state.saving?.seq === action.seq ? null : state.saving;
      if (action.seq < state.savedSeq) return { ...state, saving };
      return { ...state, saving, saved: action.settings, savedSeq: action.seq };
    }
    case "save-fail":
      if (state.saving?.seq !== action.seq) return state;
      return { ...state, saving: null, saveError: action.message };
  }
}

function savedLine(settings: Settings): string {
  return `Saved: ${settings.name} · ${settings.theme} · ${settings.density}`;
}

export default function SettingsPage() {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    (): State => ({
      attempt: 0,
      loadError: null,
      saved: null,
      savedSeq: 0,
      draft: null,
      saving: null,
      saveError: null,
    }),
  );
  const seqRef = useRef(0);
  const attempt = state.attempt;

  useEffect(() => {
    let stale = false;
    loadSettings().then(
      (settings) => {
        if (!stale) dispatch({ type: "loaded", settings });
      },
      (error: unknown) => {
        if (!stale) dispatch({ type: "load-failed", message: messageOf(error) });
      },
    );
    return () => {
      stale = true;
    };
  }, [attempt]);

  const draft = state.draft;
  const problem = draft === null ? null : nameProblem(draft.name);

  function save() {
    if (draft === null || nameProblem(draft.name) !== null) return;
    const values: Settings = { name: draft.name, theme: draft.theme, density: draft.density };
    seqRef.current += 1;
    const seq = seqRef.current;
    dispatch({ type: "save-start", seq, values });
    saveSettings(values).then(
      (settings) => dispatch({ type: "save-ok", seq, settings }),
      (error: unknown) => dispatch({ type: "save-fail", seq, message: messageOf(error) }),
    );
  }

  const shownSaved = state.saving !== null ? `${savedLine(state.saving.values)} (saving…)` : null;

  return (
    <section aria-label="Settings">
      <div data-testid="load" role="status">
        {state.loadError === null && state.saved === null && <p>Loading settings…</p>}
        {state.loadError !== null && (
          <>
            <p role="alert">{`Could not load settings: ${state.loadError}`}</p>
            <button type="button" data-testid="retry-load" onClick={() => dispatch({ type: "retry-load" })}>
              retry
            </button>
          </>
        )}
      </div>

      {state.saved !== null && <p data-testid="saved">{shownSaved ?? savedLine(state.saved)}</p>}

      {draft !== null && (
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
              value={draft.name}
              onChange={(e) => dispatch({ type: "name", name: e.target.value })}
            />
          </label>
          <span data-testid="name-count">{`${draft.name.length}/${NAME_MAX}`}</span>
          {problem !== null && <p role="alert" data-testid="name-error">{problem}</p>}

          <div role="group" aria-label="Theme">
            <button
              type="button"
              data-testid="theme-light"
              aria-pressed={draft.theme === "light"}
              onClick={() => dispatch({ type: "theme", theme: "light" })}
            >
              Light
            </button>
            <button
              type="button"
              data-testid="theme-dark"
              aria-pressed={draft.theme === "dark"}
              onClick={() => dispatch({ type: "theme", theme: "dark" })}
            >
              Dark
            </button>
          </div>

          <button type="button" data-testid="density-toggle" onClick={() => dispatch({ type: "density-toggle" })}>
            {`Density: ${draft.density}`}
          </button>

          <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>

          <button type="submit" data-testid="save">
            Save
          </button>
          {state.saveError !== null && (
            <p role="alert" data-testid="save-error">{`Save failed: ${state.saveError}`}</p>
          )}
        </form>
      )}
    </section>
  );
}
