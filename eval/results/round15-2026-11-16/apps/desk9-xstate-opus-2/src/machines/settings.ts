import { assign, enqueueActions, setup } from "xstate";
import type { Settings } from "../types";
import { loadSettings, saveRequest } from "../requests";
import { errorMessage } from "../clock";

export const NAME_MAX = 20;

export function nameError(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  if (name.length > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  return null;
}

type Context = {
  /** what the server last confirmed as saved */
  saved: Settings | null;
  savedOpId: number;
  draft: Settings;
  loadError: string | null;
  /** the latest save in flight, if any */
  saving: { opId: number; settings: Settings } | null;
  saveError: string | null;
  nextOpId: number;
};

type Event =
  | { type: "load.retry" }
  | { type: "name.change"; value: string }
  | { type: "theme.set"; theme: Settings["theme"] }
  | { type: "density.toggle" }
  | { type: "save" }
  | { type: "save.done"; opId: number; output: Settings; at: number }
  | { type: "save.failed"; opId: number; message: string };

export const settingsMachine = setup({
  types: { context: {} as Context, events: {} as Event },
  actors: { loadSettings, saveRequest },
  guards: {
    draftValid: ({ context }) => nameError(context.draft.name) === null,
  },
}).createMachine({
  id: "settings",
  initial: "loading",
  context: {
    saved: null,
    savedOpId: 0,
    draft: { name: "", theme: "light", density: "comfortable" },
    loadError: null,
    saving: null,
    saveError: null,
    nextOpId: 1,
  },
  states: {
    loading: {
      invoke: {
        src: "loadSettings",
        onDone: {
          target: "loaded",
          actions: assign({ saved: ({ event }) => event.output, draft: ({ event }) => event.output, loadError: null }),
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
    loaded: {
      on: {
        "name.change": { actions: assign({ draft: ({ context, event }) => ({ ...context.draft, name: event.value }) }) },
        "theme.set": { actions: assign({ draft: ({ context, event }) => ({ ...context.draft, theme: event.theme }) }) },
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
            const opId = context.nextOpId;
            const settings = { ...context.draft };
            enqueue.assign({ saving: { opId, settings }, saveError: null, nextOpId: opId + 1 });
            enqueue.spawnChild("saveRequest", { id: `save-${opId}`, input: { opId, settings } });
          }),
        },
        "save.done": {
          actions: enqueueActions(({ context, event, enqueue }) => {
            const newer = event.opId > context.savedOpId;
            enqueue.assign({
              saved: newer ? event.output : context.saved,
              savedOpId: newer ? event.opId : context.savedOpId,
              saving: context.saving?.opId === event.opId ? null : context.saving,
            });
            enqueue.stopChild(`save-${event.opId}`);
          }),
        },
        "save.failed": {
          actions: enqueueActions(({ context, event, enqueue }) => {
            if (context.saving?.opId === event.opId) {
              enqueue.assign({ saving: null, saveError: event.message });
            }
            enqueue.stopChild(`save-${event.opId}`);
          }),
        },
      },
    },
  },
});
