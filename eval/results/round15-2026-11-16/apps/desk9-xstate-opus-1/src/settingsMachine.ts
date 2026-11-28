import { assign, enqueueActions, fromPromise, setup } from "xstate";
import * as api from "./api";
import type { Settings, Theme } from "./api";
import { errorMessage, requestMachine } from "./requests";

export const NAME_MAX = 20;

export const nameLength = (name: string) => Array.from(name).length;

export function nameError(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  const n = nameLength(name);
  if (n > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${n}`;
  return null;
}

type SaveReq = { seq: number; settings: Settings };

export interface SettingsContext {
  loadError: string | null;
  /** the settings as the server last confirmed them */
  saved: Settings | null;
  /** seq of the save whose answer `saved` holds (0: the load) */
  savedSeq: number;
  draft: Settings;
  /** saves still in the air, oldest first */
  saving: SaveReq[];
  nextSeq: number;
  saveError: string | null;
}

export type SettingsEvent =
  | { type: "RETRY_LOAD" }
  | { type: "NAME"; value: string }
  | { type: "THEME"; theme: Theme }
  | { type: "TOGGLE_DENSITY" }
  | { type: "SAVE" }
  | { type: "save.done"; input: SaveReq; output: Settings }
  | { type: "save.failed"; input: SaveReq; message: string };

/** What the saved line shows: the newest save in the air, or else what the server confirmed. */
export function savedLine(ctx: SettingsContext): { settings: Settings; saving: boolean } | null {
  const inAir = ctx.saving.filter(s => s.seq > ctx.savedSeq);
  if (inAir.length) return { settings: inAir[inAir.length - 1].settings, saving: true };
  return ctx.saved ? { settings: ctx.saved, saving: false } : null;
}

export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    load: fromPromise<Settings>(() => api.loadSettings()),
    saveRequest: requestMachine("save", (r: SaveReq) => api.saveSettings(r.settings)),
  },
}).createMachine({
  id: "settings",
  context: {
    loadError: null,
    saved: null,
    savedSeq: 0,
    draft: { name: "", theme: "light", density: "comfortable" },
    saving: [],
    nextSeq: 1,
    saveError: null,
  },
  initial: "loading",
  states: {
    loading: {
      invoke: {
        src: "load",
        onDone: {
          target: "ready",
          actions: assign({ saved: ({ event }) => event.output, draft: ({ event }) => ({ ...event.output }), loadError: null }),
        },
        onError: { target: "failed", actions: assign({ loadError: ({ event }) => errorMessage(event.error) }) },
      },
    },
    failed: {
      on: { RETRY_LOAD: { target: "loading" } },
    },
    ready: {
      on: {
        NAME: { actions: assign({ draft: ({ context, event }) => ({ ...context.draft, name: event.value }) }) },
        THEME: { actions: assign({ draft: ({ context, event }) => ({ ...context.draft, theme: event.theme }) }) },
        TOGGLE_DENSITY: {
          actions: assign({
            draft: ({ context }) => ({ ...context.draft, density: context.draft.density === "compact" ? "comfortable" : "compact" }),
          }),
        },
        SAVE: {
          guard: ({ context }) => nameError(context.draft.name) === null,
          actions: enqueueActions(({ context, enqueue }) => {
            const req: SaveReq = { seq: context.nextSeq, settings: { ...context.draft } };
            enqueue.assign({ saving: [...context.saving, req], nextSeq: req.seq + 1, saveError: null });
            enqueue.spawnChild("saveRequest", { input: req });
          }),
        },
        "save.done": {
          actions: assign(({ context, event }) => {
            const newer = event.input.seq > context.savedSeq;
            return {
              saving: context.saving.filter(s => s.seq !== event.input.seq),
              saved: newer ? event.output : context.saved,
              savedSeq: newer ? event.input.seq : context.savedSeq,
            };
          }),
        },
        "save.failed": {
          actions: assign(({ context, event }) => ({
            saving: context.saving.filter(s => s.seq !== event.input.seq),
            saveError: event.message,
          })),
        },
      },
    },
  },
});
