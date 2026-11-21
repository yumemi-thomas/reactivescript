import type { Dispatch } from "react";
import { loadSettings, saveSettings, type Settings, type Theme } from "./api.js";
import { errorMessage, nextToken } from "./util";

export type SettingsState = {
  load: { token: number; status: "loading" | "ok" | "error"; error: string | null };
  saved: Settings | null;
  draft: Settings | null;
  saving: { token: number; values: Settings } | null;
  saveError: string | null;
};

export type SettingsAction =
  | { type: "reset"; token: number }
  | { type: "loadStart"; token: number }
  | { type: "loaded"; token: number; settings: Settings }
  | { type: "loadErr"; token: number; error: string }
  | { type: "setName"; name: string }
  | { type: "setTheme"; theme: Theme }
  | { type: "toggleDensity" }
  | { type: "saveStart"; token: number; values: Settings }
  | { type: "saveOk"; token: number; settings: Settings }
  | { type: "saveErr"; token: number; error: string };

export const INITIAL_SETTINGS: SettingsState = {
  load: { token: 0, status: "loading", error: null },
  saved: null,
  draft: null,
  saving: null,
  saveError: null,
};

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case "reset":
      return { ...INITIAL_SETTINGS, load: { token: action.token, status: "loading", error: null } };
    case "loadStart":
      return { ...state, load: { token: action.token, status: "loading", error: null } };
    case "loaded":
      if (action.token !== state.load.token) return state;
      return {
        ...state,
        load: { token: action.token, status: "ok", error: null },
        saved: action.settings,
        draft: { ...action.settings },
      };
    case "loadErr":
      if (action.token !== state.load.token) return state;
      return { ...state, load: { token: action.token, status: "error", error: action.error } };
    case "setName":
      return state.draft ? { ...state, draft: { ...state.draft, name: action.name } } : state;
    case "setTheme":
      return state.draft ? { ...state, draft: { ...state.draft, theme: action.theme } } : state;
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
      return { ...state, saving: { token: action.token, values: action.values }, saveError: null };
    case "saveOk":
      if (state.saving?.token !== action.token) return state;
      return { ...state, saved: action.settings, saving: null };
    case "saveErr":
      if (state.saving?.token !== action.token) return state;
      return { ...state, saving: null, saveError: action.error };
    default:
      return state;
  }
}

type Send = Dispatch<SettingsAction>;

function runLoad(d: Send, token: number): void {
  loadSettings().then(
    (settings) => d({ type: "loaded", token, settings }),
    (e: unknown) => d({ type: "loadErr", token, error: errorMessage(e) }),
  );
}

export function openSettings(d: Send): void {
  const token = nextToken();
  d({ type: "reset", token });
  runLoad(d, token);
}

export function retryLoadSettings(d: Send): void {
  const token = nextToken();
  d({ type: "loadStart", token });
  runLoad(d, token);
}

export function saveDraft(d: Send, values: Settings): void {
  const token = nextToken();
  d({ type: "saveStart", token, values: { ...values } });
  saveSettings({ ...values }).then(
    (settings) => d({ type: "saveOk", token, settings }),
    (e: unknown) => d({ type: "saveErr", token, error: errorMessage(e) }),
  );
}

/** The problem with a display name, or null when it is valid. */
export function nameProblem(name: string): string | null {
  if (name.length === 0) return "Display name is required";
  if (name.length > 20) return `Display name must be at most 20 characters, not ${name.length}`;
  return null;
}
