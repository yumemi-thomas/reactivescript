import { assign, fromPromise, setup } from "xstate";
import { fetchArchived, restoreCard } from "./api";
import type { Archived } from "./api";
import { errorMessage, requestMachine } from "./request";
import type { RequestInput } from "./request";

type RestorePending = { id: number; row: Archived; index: number };

export type ArchiveContext = {
  rows: Archived[];
  error: string | null;
  restoreError: string | null;
  pending: Record<string, RestorePending>;
  seq: number;
};

export type ArchiveEvent =
  | { type: "restore"; id: number }
  | { type: "opSucceeded"; opId: string; output: unknown }
  | { type: "opFailed"; opId: string; error: string };

const archiveSetup = setup({
  types: { context: {} as ArchiveContext, events: {} as ArchiveEvent },
  actors: {
    request: requestMachine,
    loadArchive: fromPromise<Archived[]>(() => fetchArchived()),
  },
});

const request = (opId: string, run: () => Promise<unknown>): { id: string; input: RequestInput } => ({
  id: opId,
  input: { opId, run },
});

/** The archive page: lists archived cards and restores them. */
export const archiveMachine = archiveSetup.createMachine({
  id: "archive",
  context: { rows: [], error: null, restoreError: null, pending: {}, seq: 1 },
  initial: "loading",
  states: {
    loading: {
      invoke: {
        src: "loadArchive",
        onDone: { target: "ready", actions: assign(({ event }) => ({ rows: event.output })) },
        onError: { target: "failed", actions: assign(({ event }) => ({ error: errorMessage(event.error) })) },
      },
    },
    ready: {},
    failed: {},
  },
  on: {
    restore: {
      guard: ({ context, event }) => context.rows.some((r) => r.id === event.id),
      actions: assign(({ context, event, spawn }) => {
        const index = context.rows.findIndex((r) => r.id === event.id);
        const row = context.rows[index];
        if (!row) return {};
        const opId = `op${context.seq}`;
        const id = row.id;
        spawn("request", request(opId, () => restoreCard(id)));
        return {
          rows: context.rows.filter((r) => r.id !== id),
          restoreError: null,
          pending: { ...context.pending, [opId]: { id, row, index } },
          seq: context.seq + 1,
        };
      }),
    },
    opSucceeded: {
      actions: assign(({ context, event }) => {
        const { [event.opId]: _done, ...pending } = context.pending;
        return { pending };
      }),
    },
    opFailed: {
      actions: assign(({ context, event }) => {
        const op = context.pending[event.opId];
        const { [event.opId]: _done, ...pending } = context.pending;
        if (!op) return { pending };
        const rows = [...context.rows];
        rows.splice(Math.min(op.index, rows.length), 0, op.row);
        return { pending, rows, restoreError: event.error };
      }),
    },
  },
});
