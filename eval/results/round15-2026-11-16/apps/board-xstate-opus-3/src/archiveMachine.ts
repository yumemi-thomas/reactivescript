import { assign, enqueueActions, fromCallback, fromPromise, setup, stopChild } from "xstate";
import * as api from "./api.js";
import type { Archived } from "./api";
import { errorMessage } from "./model";

type RestoreEvent =
  | { type: "restore.done"; cardId: number }
  | { type: "restore.failed"; cardId: number; message: string };

export type ArchiveEvent = { type: "restore"; cardId: number } | { type: "retry" } | RestoreEvent;

export type ArchiveContext = {
  /** archived cards as the server last told us, most recently archived first */
  cards: Archived[];
  /** ids being restored: hidden from the list until the server answers */
  restoring: number[];
  error: string | null;
  restoreError: string | null;
};

const fetchArchived = fromPromise<Archived[]>(() => api.fetchArchived());

/** Asks the server to restore one card and reports back. Stopping it drops a late answer. */
const restoreRequest = fromCallback<{ type: "noop" }, { cardId: number }, RestoreEvent>(({ input, sendBack }) => {
  let live = true;
  api.restoreCard(input.cardId).then(
    () => {
      if (live) sendBack({ type: "restore.done", cardId: input.cardId });
    },
    (error: unknown) => {
      if (live) sendBack({ type: "restore.failed", cardId: input.cardId, message: errorMessage(error) });
    },
  );
  return () => {
    live = false;
  };
});

export const shownArchived = (context: ArchiveContext): Archived[] =>
  context.cards.filter(c => !context.restoring.includes(c.id));

export const archiveMachine = setup({
  types: {
    context: {} as ArchiveContext,
    events: {} as ArchiveEvent,
  },
  actors: { fetchArchived, restoreRequest },
}).createMachine({
  id: "archive",
  initial: "loading",
  context: { cards: [], restoring: [], error: null, restoreError: null },
  states: {
    loading: {
      entry: assign({ error: null }),
      invoke: {
        src: "fetchArchived",
        onDone: { target: "ready", actions: assign({ cards: ({ event }) => event.output }) },
        onError: { target: "failed", actions: assign({ error: ({ event }) => errorMessage(event.error) }) },
      },
    },
    failed: {
      on: { retry: "loading" },
    },
    ready: {
      on: {
        restore: {
          actions: enqueueActions(({ context, event, enqueue }) => {
            const id = event.cardId;
            if (context.restoring.includes(id) || !context.cards.some(c => c.id === id)) return;
            enqueue.assign({ restoring: [...context.restoring, id], restoreError: null });
            enqueue.spawnChild("restoreRequest", { id: `restore-${id}`, input: { cardId: id } });
          }),
        },
        "restore.done": {
          actions: [
            stopChild(({ event }) => `restore-${event.cardId}`),
            assign(({ context, event }) => ({
              cards: context.cards.filter(c => c.id !== event.cardId),
              restoring: context.restoring.filter(id => id !== event.cardId),
            })),
          ],
        },
        "restore.failed": {
          actions: [
            stopChild(({ event }) => `restore-${event.cardId}`),
            assign(({ context, event }) => ({
              restoring: context.restoring.filter(id => id !== event.cardId),
              restoreError: event.message,
            })),
          ],
        },
      },
    },
  },
});
