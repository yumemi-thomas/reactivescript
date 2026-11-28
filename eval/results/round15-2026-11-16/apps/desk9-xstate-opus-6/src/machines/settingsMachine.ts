import { assign, enqueueActions, fromPromise, setup, stopChild } from "xstate";
import * as api from "../api.js";
import type { Settings, Theme } from "../api.js";
import { errorMessage, request } from "./request";

export const NAME_MAX = 20;

type PendingSave = { opId: string; seq: number; settings: Settings };

export type SettingsContext = {
  loadError: string;
  /** what the server last said was saved */
  saved: Settings | null;
  /** the sequence number of the save `saved` comes from */
  savedSeq: number;
  draft: Settings;
  pending: PendingSave[];
  saveError: string | null;
  seq: number;
};

export type SettingsEvent =
  | { type: "load.retry" }
  | { type: "name.change"; value: string }
  | { type: "theme.set"; theme: Theme }
  | { type: "density.toggle" }
  | { type: "save" }
  | { type: "save.ok"; opId: string; settings: Settings }
  | { type: "save.fail"; opId: string; message: string };

export function nameError(name: string): string | null {
  if (name.length === 0) return "Display name is required";
  if (name.length > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  return null;
}

export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    loadSettings: fromPromise<Settings>(() => api.loadSettings()),
    saveSettings: request(
      (i: { opId: string; settings: Settings }) => api.saveSettings(i.settings),
      (i, settings): SettingsEvent => ({ type: "save.ok", opId: i.opId, settings }),
      (i, message): SettingsEvent => ({ type: "save.fail", opId: i.opId, message }),
    ),
  },
}).createMachine({
  id: "settings",
  initial: "loading",
  context: {
    loadError: "",
    saved: null,
    savedSeq: -1,
    draft: { name: "", theme: "light", density: "comfortable" },
    pending: [],
    saveError: null,
    seq: 0,
  },
  states: {
    loading: {
      invoke: {
        src: "loadSettings",
        onDone: {
          target: "loaded",
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
    loaded: {
      on: {
        "name.change": { actions: assign({ draft: ({ context, event }) => ({ ...context.draft, name: event.value }) }) },
        "theme.set": { actions: assign({ draft: ({ context, event }) => ({ ...context.draft, theme: event.theme }) }) },
        "density.toggle": {
          actions: assign({
            draft: ({ context }) => ({
              ...context.draft,
              density: context.draft.density === "compact" ? ("comfortable" as const) : ("compact" as const),
            }),
          }),
        },
        save: {
          guard: ({ context }) => nameError(context.draft.name) === null,
          actions: enqueueActions(({ context, enqueue }) => {
            const opId = `save-${context.seq}`;
            const settings = { ...context.draft };
            enqueue.assign({
              seq: context.seq + 1,
              saveError: null,
              pending: [...context.pending, { opId, seq: context.seq, settings }],
            });
            enqueue.spawnChild("saveSettings", { id: opId, input: { opId, settings } });
          }),
        },
        "save.ok": {
          actions: [
            assign(({ context, event }) => {
              const save = context.pending.find((p) => p.opId === event.opId);
              if (!save) return {};
              const pending = context.pending.filter((p) => p !== save);
              // An older save answering after a newer one does not undo the newer one.
              return save.seq > context.savedSeq ? { pending, saved: event.settings, savedSeq: save.seq } : { pending };
            }),
            stopChild(({ event }) => event.opId),
          ],
        },
        "save.fail": {
          actions: [
            assign(({ context, event }) => {
              const save = context.pending.find((p) => p.opId === event.opId);
              if (!save) return {};
              const pending = context.pending.filter((p) => p !== save);
              // Only the latest save's failure is news: a newer save has already replaced it.
              const latest = save.seq === context.seq - 1;
              return latest ? { pending, saveError: `Save failed: ${event.message}` } : { pending };
            }),
            stopChild(({ event }) => event.opId),
          ],
        },
      },
    },
  },
});
