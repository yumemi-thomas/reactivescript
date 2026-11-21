import { assign, enqueueActions, fromPromise, setup } from "xstate";
import * as api from "./api.js";
import { errorMessage, insertAt, type ArchivedRow } from "./model";
import { requestMachine } from "./requests";
import { startRequest, type RequestMeta } from "./requests";

export type ArchiveContext = {
  rows: ArchivedRow[];
  loadError: string | undefined;
  restoreError: string | undefined;
  seq: number;
};

export type ArchiveEvent =
  | { type: "RESTORE"; id: number }
  | { type: "request.succeeded"; meta: RequestMeta; result: unknown }
  | { type: "request.failed"; meta: RequestMeta; message: string };

/** The archive page: loads the archived cards, and restores them optimistically. */
export const archiveMachine = setup({
  types: {
    context: {} as ArchiveContext,
    events: {} as ArchiveEvent,
  },
  actors: {
    fetchArchived: fromPromise<ArchivedRow[]>(() => api.fetchArchived()),
    request: requestMachine,
  },
}).createMachine({
  id: "archive",
  context: { rows: [], loadError: undefined, restoreError: undefined, seq: 0 },
  initial: "loading",
  on: {
    "request.failed": {
      actions: assign(({ context, event }) => {
        const { meta } = event;
        if (meta.kind !== "restore") return {};
        return {
          rows: insertAt(context.rows, meta.index, meta.row),
          restoreError: event.message,
        };
      }),
    },
  },
  states: {
    loading: {
      invoke: {
        src: "fetchArchived",
        onDone: {
          target: "ready",
          actions: assign({ rows: ({ event }) => event.output }),
        },
        onError: {
          target: "failed",
          actions: assign({ loadError: ({ event }) => errorMessage(event.error) }),
        },
      },
    },
    ready: {
      on: {
        RESTORE: {
          actions: enqueueActions(({ context, event, enqueue }) => {
            const index = context.rows.findIndex((r) => r.id === event.id);
            if (index === -1) return;
            const row = context.rows[index];
            const id = event.id;
            const meta: RequestMeta = { kind: "restore", row, index };
            const req = startRequest(context.seq, meta, () => api.restoreCard(id));
            enqueue.spawnChild("request", req);
            enqueue.assign({
              rows: context.rows.filter((r) => r.id !== id),
              restoreError: undefined,
              seq: context.seq + 1,
            });
          }),
        },
      },
    },
    failed: {},
  },
});
