import { assign, fromPromise, setup } from "xstate";
import { fetchArchived, type Archived } from "./api";
import { messageOf } from "./model";
import { opMachine } from "./ops";

type RestorePending = { id: number; index: number; row: Archived };

export type ArchiveContext = {
  archived: Archived[];
  loadError: string | null;
  restoreError: string | null;
  pending: Record<string, RestorePending>;
  nextOpId: number;
};

export type ArchiveEvent =
  | { type: "restore"; id: number }
  | { type: "op.done"; opId: string; output: unknown }
  | { type: "op.failed"; opId: string; message: string };

/** The archive page: loads the archived cards, and restores them one call per row. */
export const archiveMachine = setup({
  types: {
    context: {} as ArchiveContext,
    events: {} as ArchiveEvent,
  },
  actors: {
    fetchArchived: fromPromise(() => fetchArchived()),
    op: opMachine,
  },
}).createMachine({
  id: "archive",
  initial: "loading",
  context: { archived: [], loadError: null, restoreError: null, pending: {}, nextOpId: 1 },
  on: {
    "op.done": {
      actions: assign(({ context, event }) => {
        const pending = { ...context.pending };
        delete pending[event.opId];
        return { pending };
      }),
    },
    "op.failed": {
      actions: assign(({ context, event }) => {
        const meta = context.pending[event.opId];
        const pending = { ...context.pending };
        delete pending[event.opId];
        if (!meta) return { pending };
        // The row comes back where it was.
        const archived = [...context.archived];
        archived.splice(meta.index, 0, meta.row);
        return { pending, archived, restoreError: `restore error: ${event.message}` };
      }),
    },
  },
  states: {
    loading: {
      invoke: {
        src: "fetchArchived",
        onDone: {
          target: "loaded",
          actions: assign({ archived: ({ event }) => event.output }),
        },
        onError: {
          target: "failed",
          actions: assign({ loadError: ({ event }) => messageOf(event.error) }),
        },
      },
    },
    loaded: {
      on: {
        restore: {
          actions: assign(({ context, spawn, event }) => {
            const index = context.archived.findIndex((row) => row.id === event.id);
            if (index < 0) return {};
            const row = context.archived[index];
            const opId = `op${context.nextOpId}`;
            spawn("op", { id: opId, input: { opId, request: { type: "restore", id: row.id } } });
            return {
              archived: context.archived.filter((r) => r.id !== row.id),
              restoreError: null,
              pending: { ...context.pending, [opId]: { id: row.id, index, row } },
              nextOpId: context.nextOpId + 1,
            };
          }),
        },
      },
    },
    failed: {},
  },
});
