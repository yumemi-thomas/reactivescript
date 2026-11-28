import { assign, fromPromise, setup } from "xstate";
import * as api from "./api.js";
import type { Settings } from "./api.js";
import { messageOf, must } from "./util";

export const MAX_NAME_LENGTH = 20;

/** The problem with a display name, or null when it is valid. */
export function nameProblem(name: string): string | null {
  if (name.trim().length === 0) return "Display name is required";
  if (name.length > MAX_NAME_LENGTH) {
    return `Display name must be at most ${MAX_NAME_LENGTH} characters, not ${name.length}`;
  }
  return null;
}

export type SettingsContext = {
  /** the form's values; the user owns them once loaded */
  draft: Settings | null;
  /** the settings the server last answered with */
  saved: Settings | null;
  /** the values of the save in flight */
  saving: Settings | null;
  loadError: string | null;
  saveError: string | null;
};

type SettingsEvent =
  | { type: "RETRY_LOAD" }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_THEME"; theme: Settings["theme"] }
  | { type: "TOGGLE_DENSITY" }
  | { type: "SAVE" };

export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    loadSettings: fromPromise<Settings, void>(() => api.loadSettings()),
    saveSettings: fromPromise<Settings, Settings>(({ input }) => api.saveSettings(input)),
  },
}).createMachine({
  id: "settings",
  initial: "loading",
  context: {
    draft: null,
    saved: null,
    saving: null,
    loadError: null,
    saveError: null,
  },
  states: {
    loading: {
      invoke: {
        src: "loadSettings",
        onDone: {
          target: "editing",
          actions: assign(({ event }) => ({ draft: event.output, saved: event.output, loadError: null })),
        },
        onError: {
          target: "loadFailed",
          actions: assign({ loadError: ({ event }) => messageOf(event.error) }),
        },
      },
    },
    loadFailed: {
      on: {
        RETRY_LOAD: { target: "loading", actions: assign({ loadError: null }) },
      },
    },
    editing: {
      initial: "idle",
      on: {
        SET_NAME: {
          actions: assign({
            draft: ({ context, event }) => (context.draft ? { ...context.draft, name: event.name } : null),
          }),
        },
        SET_THEME: {
          actions: assign({
            draft: ({ context, event }) => (context.draft ? { ...context.draft, theme: event.theme } : null),
          }),
        },
        TOGGLE_DENSITY: {
          actions: assign({
            draft: ({ context }) =>
              context.draft
                ? {
                    ...context.draft,
                    density: context.draft.density === "compact" ? "comfortable" : "compact",
                  }
                : null,
          }),
        },
      },
      states: {
        idle: {
          on: {
            SAVE: {
              guard: ({ context }) => context.draft !== null && nameProblem(context.draft.name) === null,
              target: "saving",
              actions: assign({
                saving: ({ context }) => context.draft,
                saveError: null,
              }),
            },
          },
        },
        saving: {
          invoke: {
            src: "saveSettings",
            input: ({ context }) => must(context.saving, "nothing to save"),
            onDone: {
              target: "idle",
              actions: assign({ saved: ({ event }) => event.output, saving: null }),
            },
            onError: {
              target: "idle",
              actions: assign({
                saveError: ({ event }) => messageOf(event.error),
                saving: null,
              }),
            },
          },
        },
      },
    },
  },
});
