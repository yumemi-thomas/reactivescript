import { assign, fromPromise, setup } from "xstate";
import * as api from "../api.js";
import type { Settings, Theme } from "../api.js";
import { errMessage } from "./shared.js";

export const NAME_MAX = 20;

export type SettingsContext = {
  /** the settings as the server last answered them */
  saved: Settings | null;
  /** the form; belongs to the user once loaded */
  draft: Settings | null;
  /** the settings a save in flight is saving */
  pending: Settings | null;
  loadError: string;
  saveError: string;
};

export type SettingsEvent =
  | { type: "retry.load" }
  | { type: "name.set"; value: string }
  | { type: "theme.set"; theme: Theme }
  | { type: "density.toggle" }
  | { type: "save" };

/** a name can be saved when it has text and is at most NAME_MAX characters */
export const nameIsValid = (name: string): boolean => name.trim() !== "" && name.length <= NAME_MAX;

export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    loadSettings: fromPromise<Settings, undefined>(async () => api.loadSettings()),
    saveSettings: fromPromise<Settings, Settings>(async ({ input }) => api.saveSettings(input)),
  },
}).createMachine({
  id: "settings",
  context: { saved: null, draft: null, pending: null, loadError: "", saveError: "" },
  initial: "loading",
  states: {
    loading: {
      invoke: {
        src: "loadSettings",
        onDone: {
          target: "loaded",
          actions: assign({
            saved: ({ event }) => event.output,
            draft: ({ event }) => ({ ...event.output }),
          }),
        },
        onError: {
          target: "failed",
          actions: assign({ loadError: ({ event }) => errMessage(event.error) }),
        },
      },
    },
    failed: {
      on: { "retry.load": { target: "loading", actions: assign({ loadError: "" }) } },
    },
    loaded: {
      initial: "idle",
      on: {
        "name.set": {
          actions: assign({
            draft: ({ context, event }) => (context.draft ? { ...context.draft, name: event.value } : null),
          }),
        },
        "theme.set": {
          actions: assign({
            draft: ({ context, event }) => (context.draft ? { ...context.draft, theme: event.theme } : null),
          }),
        },
        "density.toggle": {
          actions: assign({
            draft: ({ context }) =>
              context.draft
                ? { ...context.draft, density: context.draft.density === "compact" ? "comfortable" : "compact" }
                : null,
          }),
        },
        save: {
          guard: ({ context }) => context.draft !== null && nameIsValid(context.draft.name),
          target: ".saving",
          reenter: true,
          actions: assign({
            pending: ({ context }) => {
              const d = context.draft as Settings;
              return { name: d.name.trim(), theme: d.theme, density: d.density };
            },
            saveError: "",
          }),
        },
      },
      states: {
        idle: {},
        saving: {
          invoke: {
            src: "saveSettings",
            input: ({ context }) => context.pending as Settings,
            onDone: {
              target: "idle",
              actions: assign({ saved: ({ event }) => event.output, pending: null }),
            },
            onError: {
              target: "idle",
              actions: assign({
                saveError: ({ event }) => `Save failed: ${errMessage(event.error)}`,
                pending: null,
              }),
            },
          },
        },
      },
    },
  },
});

