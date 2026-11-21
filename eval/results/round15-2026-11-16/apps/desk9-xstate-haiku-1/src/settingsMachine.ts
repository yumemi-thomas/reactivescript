import { assign, fromPromise, setup } from "xstate";
import * as api from "./api.js";
import type { Settings } from "./api.js";
import { messageOf } from "./shared.js";

export const NAME_MAX = 20;

/** The reason the display name is invalid, or null when it is valid. */
export function nameProblem(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  if (name.length > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  return null;
}

type SettingsEvent =
  | { type: "SET_NAME"; name: string }
  | { type: "SET_THEME"; theme: "light" | "dark" }
  | { type: "TOGGLE_DENSITY" }
  | { type: "SAVE" }
  | { type: "RETRY" };

export type SettingsContext = {
  draft: Settings;
  saved: Settings | null;
  pendingSave: Settings | null;
  loadError: string | null;
  saveError: string | null;
};

export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    loadSettings: fromPromise<Settings>(() => api.loadSettings()),
    saveSettings: fromPromise<Settings, Settings>(({ input }) => api.saveSettings(input)),
  },
}).createMachine({
  id: "settings",
  context: {
    draft: { name: "", theme: "light", density: "comfortable" },
    saved: null,
    pendingSave: null,
    loadError: null,
    saveError: null,
  },
  initial: "loading",
  states: {
    loading: {
      invoke: {
        src: "loadSettings",
        onDone: {
          target: "loaded",
          actions: assign({
            draft: ({ event }) => event.output,
            saved: ({ event }) => event.output,
            loadError: null,
          }),
        },
        onError: {
          target: "loadFailed",
          actions: assign({ loadError: ({ event }) => messageOf(event.error) }),
        },
      },
    },
    loadFailed: {
      on: { RETRY: { target: "loading" } },
    },
    loaded: {
      initial: "idle",
      on: {
        SET_NAME: {
          actions: assign({ draft: ({ context, event }) => ({ ...context.draft, name: event.name }) }),
        },
        SET_THEME: {
          actions: assign({ draft: ({ context, event }) => ({ ...context.draft, theme: event.theme }) }),
        },
        TOGGLE_DENSITY: {
          actions: assign({
            draft: ({ context }) => ({
              ...context.draft,
              density: context.draft.density === "compact" ? "comfortable" : "compact",
            }),
          }),
        },
        SAVE: {
          guard: ({ context }) => nameProblem(context.draft.name) === null,
          target: ".saving",
          reenter: true,
          actions: assign({
            pendingSave: ({ context }) => context.draft,
            saveError: null,
          }),
        },
      },
      states: {
        idle: {},
        saving: {
          invoke: {
            src: "saveSettings",
            input: ({ context }) => context.pendingSave as Settings,
            onDone: {
              target: "idle",
              actions: assign({ saved: ({ event }) => event.output, pendingSave: null }),
            },
            onError: {
              target: "idle",
              actions: assign({
                saveError: ({ event }) => messageOf(event.error),
                pendingSave: null,
              }),
            },
          },
        },
      },
    },
  },
});
