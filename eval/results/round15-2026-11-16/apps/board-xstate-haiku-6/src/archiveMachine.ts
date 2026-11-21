import { assign, setup, type DoneActorEvent } from "xstate";
import { call, failureOf, launch, valueOf, type CallDone, type CallInput, type Step } from "./calls";
import type { ArchivedCard } from "./types";

export type ArchiveContext = {
  archived: ArchivedCard[];
  loadError: string | null;
  restoreError: string | null;
  seq: number;
};

export type ArchiveEvent =
  | { type: "restore"; id: number }
  | { type: `xstate.done.actor.call.${string}`; output: CallDone };

function planRestore(ctx: ArchiveContext, id: number): Step<ArchiveContext> | null {
  const index = ctx.archived.findIndex((a) => a.id === id);
  if (index < 0) return null;
  const card = ctx.archived[index];
  return {
    patch: { archived: ctx.archived.filter((a) => a.id !== id), restoreError: null },
    call: { op: "restoreCard", id, index, card },
  };
}

function settle(ctx: ArchiveContext, done: CallDone): Partial<ArchiveContext> {
  const { input, result } = done;
  if (input.op !== "restoreCard" || result.ok) return {};
  const archived = [...ctx.archived];
  archived.splice(Math.min(input.index, archived.length), 0, input.card);
  return { archived, restoreError: `restore error: ${result.message}` };
}

export const archiveMachine = setup({
  types: {
    context: {} as ArchiveContext,
    events: {} as ArchiveEvent,
  },
  actors: { call },
}).createMachine({
  id: "archive",
  context: { archived: [], loadError: null, restoreError: null, seq: 1 },
  initial: "loading",
  states: {
    loading: {
      invoke: {
        id: "archiveLoad",
        src: "call",
        input: { op: "fetchArchived" } as CallInput,
        onDone: [
          {
            guard: ({ event }) => event.output.result.ok,
            target: "loaded",
            actions: assign({ archived: ({ event }) => valueOf<ArchivedCard[]>(event.output) ?? [] }),
          },
          {
            target: "failed",
            actions: assign({ loadError: ({ event }) => failureOf(event.output) }),
          },
        ],
      },
    },
    loaded: {
      on: {
        restore: {
          actions: assign(({ context, event, spawn }) => launch(context, planRestore(context, event.id), spawn)),
        },
      },
    },
    failed: {},
  },
  on: {
    "xstate.done.actor.call.*": {
      actions: assign(({ context, event }) => settle(context, (event as unknown as DoneActorEvent<CallDone>).output)),
    },
  },
});
