import { assign, enqueueActions, fromPromise, setup } from "xstate";
import * as api from "./api.js";
import type { Settings, Theme } from "./api.js";
import { errorMessage, requestMachine, type RequestEvent } from "./request";

export const MAX_NAME = 20;

export function nameError(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  if (name.length > MAX_NAME) return `Display name must be at most ${MAX_NAME} characters, not ${name.length}`;
  return null;
}

export type SettingsContext = {
  /** what the server last confirmed */
  saved: Settings | null;
  savedSeq: number;
  /** saves still in flight, oldest first */
  saving: { seq: number; settings: Settings }[];
  draft: Settings;
  saveError: string | null;
  loadError: string | null;
  nextSeq: number;
};

export type SettingsEvent =
  | { type: "load.retry" }
  | { type: "name.change"; value: string }
  | { type: "theme.set"; theme: Theme }
  | { type: "density.toggle" }
  | { type: "save" }
  | RequestEvent;

export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    loadSettings: fromPromise<Settings>(() => api.loadSettings()),
    request: requestMachine,
  },
  guards: {
    draftValid: ({ context }) => nameError(context.draft.name) === null,
  },
}).createMachine({
  id: "settings",
  context: {
    saved: null,
    savedSeq: -1,
    saving: [],
    draft: { name: "", theme: "light", density: "comfortable" },
    saveError: null,
    loadError: null,
    nextSeq: 0,
  },
  initial: "loading",
  states: {
    loading: {
      entry: assign({ loadError: null }),
      invoke: {
        src: "loadSettings",
        onDone: {
          target: "ready",
          actions: assign({ saved: ({ event }) => event.output, draft: ({ event }) => event.output }),
        },
        onError: {
          target: "failed",
          actions: assign({ loadError: ({ event }) => errorMessage(event.error) }),
        },
      },
    },
    failed: {
      on: { "load.retry": { target: "loading" } },
    },
    ready: {
      on: {
        "name.change": {
          actions: assign({ draft: ({ context, event }) => ({ ...context.draft, name: event.value }) }),
        },
        "theme.set": {
          actions: assign({ draft: ({ context, event }) => ({ ...context.draft, theme: event.theme }) }),
        },
        "density.toggle": {
          actions: assign({
            draft: ({ context }) => ({
              ...context.draft,
              density: context.draft.density === "compact" ? "comfortable" : "compact",
            }),
          }),
        },
        save: {
          guard: "draftValid",
          actions: enqueueActions(({ context, enqueue }) => {
            const seq = context.nextSeq;
            const settings: Settings = { ...context.draft };
            enqueue.assign({
              nextSeq: seq + 1,
              saving: [...context.saving, { seq, settings }],
              saveError: null,
            });
            enqueue.spawnChild("request", { input: { seq, run: () => api.saveSettings(settings) } });
          }),
        },
        "request.done": {
          actions: assign(({ context, event }) => {
            const newer = event.seq > context.savedSeq;
            return {
              saving: context.saving.filter(s => s.seq !== event.seq),
              saved: newer ? (event.output as Settings) : context.saved,
              savedSeq: newer ? event.seq : context.savedSeq,
            };
          }),
        },
        "request.failed": {
          actions: assign(({ context, event }) => ({
            saving: context.saving.filter(s => s.seq !== event.seq),
            saveError: event.message,
          })),
        },
      },
    },
  },
});
