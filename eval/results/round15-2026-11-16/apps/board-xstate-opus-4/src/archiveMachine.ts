import { assign, enqueueActions, fromPromise, setup } from "xstate";
import * as api from "./api.js";
import type { Archived } from "./api.js";
import { errorMessage, requestMachine, type RequestReport } from "./requests.js";

type Restore = { seq: number; id: number; accepted: boolean };

export type ArchiveContext = {
  /** the archive as the server sent it */
  base: Archived[];
  loadError: string | null;
  /** restores not declined, oldest first */
  restores: Restore[];
  nextSeq: number;
  restoreError: string | null;
};

export type ArchiveEvent = { type: "retry" } | { type: "restore"; id: number } | RequestReport;

/** The archive as shown: what the server sent, less the rows being or already restored. */
export function visibleArchive(context: ArchiveContext): Archived[] {
  const gone = new Set(context.restores.map(r => r.id));
  return context.base.filter(a => !gone.has(a.id));
}

export const archiveMachine = setup({
  types: {
    context: {} as ArchiveContext,
    events: {} as ArchiveEvent,
  },
  actors: {
    fetchArchived: fromPromise<Archived[]>(() => api.fetchArchived()),
    request: requestMachine,
  },
}).createMachine({
  id: "archive",
  context: { base: [], loadError: null, restores: [], nextSeq: 0, restoreError: null },
  initial: "loading",
  states: {
    loading: {
      entry: assign({ loadError: null }),
      invoke: {
        src: "fetchArchived",
        onDone: { target: "ready", actions: assign({ base: ({ event }) => event.output }) },
        onError: { target: "failed", actions: assign({ loadError: ({ event }) => errorMessage(event.error) }) },
      },
    },
    failed: {
      on: { retry: { target: "loading" } },
    },
    ready: {
      on: {
        restore: {
          guard: ({ context, event }) => visibleArchive(context).some(a => a.id === event.id),
          actions: enqueueActions(({ context, event, enqueue }) => {
            const seq = context.nextSeq;
            enqueue.assign({
              nextSeq: seq + 1,
              restoreError: null,
              restores: [...context.restores, { seq, id: event.id, accepted: false }],
            });
            enqueue.spawnChild("request", { id: `request-${seq}`, input: { seq, request: { kind: "restore", id: event.id } } });
          }),
        },
        "request.succeeded": {
          actions: assign({
            restores: ({ context, event }) => context.restores.map(r => (r.seq === event.seq ? { ...r, accepted: true } : r)),
          }),
        },
        "request.failed": {
          actions: assign({
            restores: ({ context, event }) => context.restores.filter(r => r.seq !== event.seq),
            restoreError: ({ event }) => event.message,
          }),
        },
      },
    },
  },
});
