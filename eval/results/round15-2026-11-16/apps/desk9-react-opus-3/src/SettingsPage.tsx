import { useEffect, useReducer } from "react";
import * as api from "./api";
import type { Settings } from "./api";
import { errorMessage, newId, type Loaded } from "./util";

const MAX_NAME = 20;

type SettingsState = {
  loadGen: number;
  load: Loaded<Settings> | null;
  draft: Settings | null;
  /** the settings the server last confirmed, and the save that confirmed them */
  saved: Settings | null;
  savedSeq: number;
  /** saves still in the air, oldest first */
  saving: { seq: number; values: Settings }[];
  lastSaveSeq: number;
  saveError: string | null;
};

type SettingsAction =
  | { type: "retryLoad"; gen: number }
  | { type: "loaded"; result: Loaded<Settings> }
  | { type: "draft"; draft: Settings }
  | { type: "saveStart"; seq: number; values: Settings }
  | { type: "saveDone"; seq: number; saved: Settings }
  | { type: "saveFailed"; seq: number; message: string };

const initial: SettingsState = {
  loadGen: 0,
  load: null,
  draft: null,
  saved: null,
  savedSeq: 0,
  saving: [],
  lastSaveSeq: 0,
  saveError: null,
};

function reducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case "retryLoad":
      return { ...state, loadGen: action.gen };
    case "loaded": {
      if (action.result.gen !== state.loadGen) return state;
      if (!action.result.ok) return { ...state, load: action.result };
      return {
        ...state,
        load: action.result,
        draft: state.draft ?? action.result.data,
        saved: state.saved ?? action.result.data,
      };
    }
    case "draft":
      return { ...state, draft: action.draft };
    case "saveStart":
      return {
        ...state,
        saving: [...state.saving, { seq: action.seq, values: action.values }],
        lastSaveSeq: action.seq,
        saveError: null,
      };
    case "saveDone": {
      const saving = state.saving.filter(s => s.seq !== action.seq);
      if (action.seq < state.savedSeq) return { ...state, saving };
      return { ...state, saving, saved: action.saved, savedSeq: action.seq };
    }
    case "saveFailed": {
      const saving = state.saving.filter(s => s.seq !== action.seq);
      return { ...state, saving, saveError: action.seq === state.lastSaveSeq ? action.message : state.saveError };
    }
  }
}

function nameError(name: string): string | null {
  if (name.length === 0) return "Display name is required";
  if (name.length > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${name.length}`;
  return null;
}

const line = (s: Settings) => `${s.name} · ${s.theme} · ${s.density}`;

export default function SettingsPage() {
  const [state, dispatch] = useReducer(reducer, initial);
  const { loadGen, draft } = state;

  useEffect(() => {
    let live = true;
    api.loadSettings().then(
      data => {
        if (live) dispatch({ type: "loaded", result: { gen: loadGen, ok: true, data } });
      },
      (e: unknown) => {
        if (live) dispatch({ type: "loaded", result: { gen: loadGen, ok: false, message: errorMessage(e) } });
      },
    );
    return () => {
      live = false;
    };
  }, [loadGen]);

  const load = state.load && state.load.gen === loadGen ? state.load : null;
  const saved = state.saved;

  if (saved === null || draft === null) {
    return (
      <section className="settings">
        <div data-testid="load">
          {!load ? (
            <p className="muted">Loading settings…</p>
          ) : !load.ok ? (
            <>
              <p className="error">Could not load settings: {load.message}</p>
              <button data-testid="retry-load" onClick={() => dispatch({ type: "retryLoad", gen: newId() })}>
                retry
              </button>
            </>
          ) : null}
        </div>
      </section>
    );
  }

  const error = nameError(draft.name);
  // The newest save still in the air, unless a newer one has already been confirmed.
  const inFlight = state.saving.filter(s => s.seq > state.savedSeq).at(-1);

  function save() {
    if (!draft || nameError(draft.name)) return;
    const seq = newId();
    const values = draft;
    dispatch({ type: "saveStart", seq, values });
    api.saveSettings(values).then(
      saved => dispatch({ type: "saveDone", seq, saved: saved ?? values }),
      (e: unknown) => dispatch({ type: "saveFailed", seq, message: errorMessage(e) }),
    );
  }

  return (
    <section className="settings">
      <p data-testid="saved" className="saved">
        {inFlight ? `Saved: ${line(inFlight.values)} (saving…)` : `Saved: ${line(saved)}`}
      </p>
      <form
        className="form"
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          Display name{" "}
          <input
            data-testid="name"
            value={draft.name}
            aria-invalid={error !== null}
            onChange={e => dispatch({ type: "draft", draft: { ...draft, name: e.target.value } })}
          />
        </label>
        <span data-testid="name-count" className="muted">
          {draft.name.length}/{MAX_NAME}
        </span>
        {error !== null && (
          <p data-testid="name-error" className="error">
            {error}
          </p>
        )}
        <div className="seg" role="group" aria-label="Theme">
          <button
            type="button"
            data-testid="theme-light"
            aria-pressed={draft.theme === "light"}
            onClick={() => dispatch({ type: "draft", draft: { ...draft, theme: "light" } })}
          >
            light
          </button>
          <button
            type="button"
            data-testid="theme-dark"
            aria-pressed={draft.theme === "dark"}
            onClick={() => dispatch({ type: "draft", draft: { ...draft, theme: "dark" } })}
          >
            dark
          </button>
        </div>
        <button
          type="button"
          data-testid="density-toggle"
          onClick={() =>
            dispatch({ type: "draft", draft: { ...draft, density: draft.density === "compact" ? "comfortable" : "compact" } })
          }
        >
          density: {draft.density}
        </button>
        <p data-testid="preview">
          Preview: {draft.theme} / {draft.density}
        </p>
        <button type="submit" data-testid="save">
          save
        </button>
        {state.saveError !== null && (
          <p data-testid="save-error" className="error" role="alert">
            Save failed: {state.saveError}
          </p>
        )}
      </form>
    </section>
  );
}
