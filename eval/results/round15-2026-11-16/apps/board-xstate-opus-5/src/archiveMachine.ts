import { assign, fromPromise, setup } from "xstate";
import * as api from "./api";
import type { Archived } from "./api";
import { errorMessage } from "./model";
import { createRequestMachine, type RequestEvent } from "./request";

export type ArchiveContext = {
  /** the archive as the server last told us, with confirmed restores taken off */
  archived: Archived[];
  /** restores the server has not answered yet: rows shown off the list */
  restoring: { opId: number; id: number }[];
  nextOpId: number;
  loadError: string | null;
  restoreError: string | null;
};

export type ArchiveEvent = { type: "RETRY" } | { type: "RESTORE"; id: number } | RequestEvent<number>;

const loadArchive = fromPromise<Archived[]>(() => api.fetchArchived());
const restoreRequest = createRequestMachine(async (id: number) => {
  await api.restoreCard(id);
  return id;
});

const archive = setup({
  types: { context: {} as ArchiveContext, events: {} as ArchiveEvent },
  actors: { loadArchive, request: restoreRequest },
  guards: {
    canRestore: ({ context, event }) =>
      event.type === "RESTORE" &&
      context.archived.some(a => a.id === event.id) &&
      !context.restoring.some(r => r.id === event.id),
  },
});

export const archiveMachine = archive.createMachine({
  id: "archive",
  context: { archived: [], restoring: [], nextOpId: 1, loadError: null, restoreError: null },
  initial: "loading",
  states: {
    loading: {
      entry: assign({ loadError: null }),
      invoke: {
        src: "loadArchive",
        onDone: { target: "ready", actions: assign({ archived: ({ event }) => event.output }) },
        onError: { target: "failed", actions: assign({ loadError: ({ event }) => errorMessage(event.error) }) },
      },
    },
    failed: { on: { RETRY: "loading" } },
    ready: {
      on: {
        RESTORE: {
          guard: "canRestore",
          actions: archive.enqueueActions(({ context, event, enqueue }) => {
            if (event.type !== "RESTORE") return;
            const opId = context.nextOpId;
            enqueue.assign({
              restoring: [...context.restoring, { opId, id: event.id }],
              nextOpId: opId + 1,
              restoreError: null,
            });
            enqueue.spawnChild("request", { id: `restore-${opId}`, input: { opId, request: event.id } });
          }),
        },
        "request.ok": {
          actions: assign(({ context, event }) => ({
            archived: context.archived.filter(a => a.id !== event.result),
            restoring: context.restoring.filter(r => r.opId !== event.opId),
          })),
        },
        "request.failed": {
          actions: assign(({ context, event }) => ({
            restoring: context.restoring.filter(r => r.opId !== event.opId),
            restoreError: event.message,
          })),
        },
      },
    },
  },
});
