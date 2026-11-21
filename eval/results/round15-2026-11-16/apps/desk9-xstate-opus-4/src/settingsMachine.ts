import { assign, enqueueActions, setup } from "xstate";
import type { Settings } from "./api";
import { errorMessage, loadSettingsLogic, mutationMachine, type Op, type OpSettledEvent } from "./requests";

export const NAME_MAX = 20;

export type SettingsContext = {
  loadError: string | null;
  /** What the server last confirmed as saved. */
  saved: Settings | null;
  savedSeq: number;
  /** The user's form. Filled once from the loaded settings, then only the user changes it. */
  draft: Settings;
  /** The latest save still in the air, if any. */
  saving: { seq: number; settings: Settings } | null;
  saveError: string | null;
  seq: number;
};

export type SettingsEvent =
  | { type: "load.retry" }
  | { type: "name.change"; value: string }
  | { type: "theme.set"; theme: Settings["theme"] }
  | { type: "density.toggle" }
  | { type: "save" }
  | OpSettledEvent;

export function nameError(name: string): string | null {
  if (name.trim() === "") return "Display name is required";
  if (name.length > NAME_MAX) return `Display name must be at most ${NAME_MAX} characters, not ${name.length}`;
  return null;
}

/** Builds settings in the server's field order. */
const settingsOf = (s: Settings): Settings => ({ name: s.name, theme: s.theme, density: s.density });

export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actors: {
    loadSettings: loadSettingsLogic,
    mutation: mutationMachine,
  },
}).createMachine({
  id: "settings",
  initial: "loading",
  context: {
    loadError: null,
    saved: null,
    savedSeq: 0,
    draft: { name: "", theme: "light", density: "comfortable" },
    saving: null,
    saveError: null,
    seq: 0,
  },
  states: {
    loading: {
      entry: assign({ loadError: null }),
      invoke: {
        src: "loadSettings",
        onDone: {
          target: "loaded",
          actions: assign(({ event }) => ({ saved: settingsOf(event.output), draft: settingsOf(event.output) })),
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
          guard: ({ context }) => nameError(context.draft.name) === null,
          actions: enqueueActions(({ context, enqueue }) => {
            const seq = context.seq + 1;
            const op: Op = { kind: "save", seq, settings: settingsOf(context.draft) };
            enqueue.assign({ seq, saving: { seq, settings: op.settings }, saveError: null });
            enqueue.spawnChild("mutation", { id: `save-${seq}`, input: { op } });
          }),
        },
        "op.done": {
          actions: assign(({ context, event }) => {
            const { op, result } = event;
            if (op.kind !== "save" || result.kind !== "save") return {};
            const patch: Partial<SettingsContext> = {};
            // An older save answering late must not overwrite a newer one.
            if (op.seq > context.savedSeq) {
              patch.saved = settingsOf(result.value);
              patch.savedSeq = op.seq;
            }
            if (context.saving?.seq === op.seq) patch.saving = null;
            return patch;
          }),
        },
        "op.failed": {
          actions: assign(({ context, event }) =>
            context.saving?.seq === event.op.seq ? { saving: null, saveError: event.message } : {},
          ),
        },
      },
    },
  },
});
