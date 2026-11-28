import { useEffect, useReducer, useRef } from "react";
import type { Dispatch } from "react";
import { loadSettings, saveSettings } from "./api.js";
import type { Settings } from "./api.js";
import { messageOf } from "./errors";

type State = {
  loadReq: number;
  load: { status: "loading" } | { status: "error"; message: string } | { status: "ok" };
  saved: Settings | null;
  draft: Settings | null;
  saving: { req: number; settings: Settings } | null;
  saveError: string | null;
};

type Action =
  | { type: "loadStart"; req: number }
  | { type: "loaded"; req: number; settings: Settings }
  | { type: "loadFailed"; req: number; message: string }
  | { type: "edit"; patch: Partial<Settings> }
  | { type: "toggleDensity" }
  | { type: "saveStart"; req: number; settings: Settings }
  | { type: "saved"; req: number; settings: Settings }
  | { type: "saveFailed"; req: number; message: string };

const initialState: State = {
  loadReq: 1,
  load: { status: "loading" },
  saved: null,
  draft: null,
  saving: null,
  saveError: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loadStart":
      return { ...state, loadReq: action.req, load: { status: "loading" } };
    case "loaded":
      if (action.req !== state.loadReq) return state;
      return {
        ...state,
        load: { status: "ok" },
        saved: action.settings,
        draft: { ...action.settings },
      };
    case "loadFailed":
      if (action.req !== state.loadReq) return state;
      return { ...state, load: { status: "error", message: action.message } };
    case "edit":
      return state.draft ? { ...state, draft: { ...state.draft, ...action.patch } } : state;
    case "toggleDensity":
      return state.draft
        ? {
            ...state,
            draft: {
              ...state.draft,
              density: state.draft.density === "compact" ? "comfortable" : "compact",
            },
          }
        : state;
    case "saveStart":
      return { ...state, saving: { req: action.req, settings: action.settings }, saveError: null };
    case "saved":
      if (state.saving?.req !== action.req) return state;
      return { ...state, saved: action.settings, saving: null };
    case "saveFailed":
      if (state.saving?.req !== action.req) return state;
      return { ...state, saving: null, saveError: `Save failed: ${action.message}` };
  }
  return state;
}

/** The display-name problem to show, or null when the name is valid. */
function nameProblem(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  if (name.length > 20) return `Display name must be at most 20 characters, not ${name.length}`;
  return null;
}

function describe(s: Settings): string {
  return `${s.name} · ${s.theme} · ${s.density}`;
}

function startLoad(dispatch: Dispatch<Action>, req: number): void {
  loadSettings().then(
    (settings) => dispatch({ type: "loaded", req, settings }),
    (e: unknown) => dispatch({ type: "loadFailed", req, message: messageOf(e) }),
  );
}

export default function SettingsPage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Request ids: the first load is 1, set in initialState.
  const seq = useRef(1);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startLoad(dispatch, 1);
  }, []);

  const retryLoad = () => {
    seq.current += 1;
    const req = seq.current;
    dispatch({ type: "loadStart", req });
    startLoad(dispatch, req);
  };

  const save = () => {
    const draft = state.draft;
    if (!draft || nameProblem(draft.name)) return;
    const settings: Settings = { ...draft, name: draft.name.trim() };
    seq.current += 1;
    const req = seq.current;
    dispatch({ type: "saveStart", req, settings });
    saveSettings(settings).then(
      (saved) => dispatch({ type: "saved", req, settings: saved }),
      (e: unknown) => dispatch({ type: "saveFailed", req, message: messageOf(e) }),
    );
  };

  const { load, saved, draft, saving, saveError } = state;
  const problem = draft ? nameProblem(draft.name) : null;
  let savedLine: string | null = null;
  if (saving) savedLine = `Saved: ${describe(saving.settings)} (saving…)`;
  else if (saved) savedLine = `Saved: ${describe(saved)}`;

  return (
    <section aria-label="settings">
      <p data-testid="load">
        {load.status === "loading" && "Loading settings…"}
        {load.status === "error" && `Could not load settings: ${load.message}`}
      </p>
      {load.status === "error" && (
        <button type="button" data-testid="retry-load" onClick={retryLoad}>
          retry
        </button>
      )}

      {savedLine !== null && <p data-testid="saved">{savedLine}</p>}

      {draft && (
        <div>
          <label>
            Display name{" "}
            <input
              data-testid="name"
              value={draft.name}
              onChange={(e) => dispatch({ type: "edit", patch: { name: e.target.value } })}
            />
          </label>
          <span data-testid="name-count">{`${draft.name.length}/20`}</span>
          {problem && <p data-testid="name-error">{problem}</p>}

          <div>
            <button
              type="button"
              data-testid="theme-light"
              aria-pressed={draft.theme === "light"}
              onClick={() => dispatch({ type: "edit", patch: { theme: "light" } })}
            >
              light
            </button>
            <button
              type="button"
              data-testid="theme-dark"
              aria-pressed={draft.theme === "dark"}
              onClick={() => dispatch({ type: "edit", patch: { theme: "dark" } })}
            >
              dark
            </button>
            <button
              type="button"
              data-testid="density-toggle"
              onClick={() => dispatch({ type: "toggleDensity" })}
            >
              {`density: ${draft.density}`}
            </button>
          </div>

          <p data-testid="preview">{`Preview: ${draft.theme} / ${draft.density}`}</p>

          <button type="button" data-testid="save" onClick={save}>
            save
          </button>
          {saveError && <p data-testid="save-error">{saveError}</p>}
        </div>
      )}
    </section>
  );
}
