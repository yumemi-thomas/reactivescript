import { assign, enqueueActions, fromPromise, setup } from "xstate";
import * as api from "../api.js";
import type { Settings } from "../api.js";
import { errorMessage, taskMachine, type TaskEvent } from "./task";

export const NAME_MAX = 20;

/** The draft name's error, or null when it is valid. */
export function nameError(name: string): string | null {
  if (name.trim().length === 0) return "Display name is required";
  if (name.length > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  return null;
}

type PendingSave = { seq: number; settings: Settings };

export type SettingsContext = {
  loadError: string | null;
  /** the settings as the server last saved them */
  saved: Settings | null;
  savedSeq: number;
  draft: Settings;
  pending: PendingSave[];
  nextSeq: number;
  saveError: string | null;
};

export type SettingsEvent =
  | { type: "load.retry" }
  | { type: "name.change"; value: string }
  | { type: "theme.set"; theme: Settings["theme"] }
  | { type: "density.toggle" }
  | { type: "save" }
  | TaskEvent;

/** What the saved line shows: the newest save in flight, or what was saved. */
export function savedLine(ctx: SettingsContext): { settings: Settings; saving: boolean } | null {
  const inFlight = ctx.pending.filter(p => p.seq > ctx.savedSeq);
  if (inFlight.length) return { settings: inFlight[inFlight.length - 1].settings, saving: true };
  return ctx.saved ? { settings: ctx.saved, saving: false } : null;
}

export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    task: taskMachine,
    load: fromPromise<Settings>(() => api.loadSettings()),
  },
}).createMachine({
  id: "settings",
  initial: "loading",
  context: {
    loadError: null,
    saved: null,
    savedSeq: 0,
    draft: { name: "", theme: "light", density: "comfortable" },
    pending: [],
    nextSeq: 1,
    saveError: null,
  },
  states: {
    loading: {
      entry: assign({ loadError: null }),
      invoke: {
        src: "load",
        onDone: {
          target: "ready",
          actions: assign({ saved: ({ event }) => event.output, draft: ({ event }) => ({ ...event.output }) }),
        },
        onError: {
          target: "failed",
          actions: assign({ loadError: ({ event }) => errorMessage(event.error) }),
        },
      },
    },
    failed: {
      on: { "load.retry": "loading" },
    },
    ready: {
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
          guard: ({ context }) => nameError(context.draft.name) === null,
          actions: enqueueActions(({ context, enqueue }) => {
            const seq = context.nextSeq;
            const settings = { ...context.draft };
            enqueue.assign({
              pending: [...context.pending, { seq, settings }],
              nextSeq: seq + 1,
              saveError: null,
            });
            enqueue.spawnChild("task", {
              id: `save-${seq}`,
              input: { taskId: seq, run: () => api.saveSettings(settings) },
            });
          }),
        },
        "task.done": {
          actions: assign(({ context, event }) => {
            const pending = context.pending.filter(p => p.seq !== event.taskId);
            if (event.taskId <= context.savedSeq) return { pending };
            const save = context.pending.find(p => p.seq === event.taskId);
            const output = event.output as Settings | undefined;
            return {
              pending,
              saved: output && typeof output.name === "string" ? output : (save?.settings ?? context.saved),
              savedSeq: event.taskId,
            };
          }),
        },
        "task.failed": {
          actions: assign(({ context, event }) => ({
            pending: context.pending.filter(p => p.seq !== event.taskId),
            saveError: event.message,
          })),
        },
      },
    },
  },
});
