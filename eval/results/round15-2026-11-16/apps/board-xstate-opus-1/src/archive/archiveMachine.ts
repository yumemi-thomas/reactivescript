import { assign, enqueueActions, fromCallback, fromPromise, setup, stopChild } from "xstate";
import type { EventObject } from "xstate";
import * as api from "../api";
import type { Archived } from "../api";
import { message } from "../board/model";

const fetchArchived = fromPromise<Archived[]>(() => api.fetchArchived());

/** Asks the server to restore one card and reports back how it went. */
const restore = fromCallback<EventObject, { id: number }>(({ input, sendBack }) => {
  let live = true;
  api.restoreCard(input.id).then(
    () => {
      if (live) sendBack({ type: "restore.done", id: input.id });
    },
    (error: unknown) => {
      if (live) sendBack({ type: "restore.failed", id: input.id, message: message(error) });
    },
  );
  return () => {
    live = false;
  };
});

export type ArchiveContext = {
  cards: Archived[];
  /** ids being restored: hidden from the list until the server answers */
  restoring: number[];
  loadError: string | null;
  restoreError: string | null;
};

export type ArchiveEvent =
  | { type: "retry" }
  | { type: "restore"; id: number }
  | { type: "restore.done"; id: number }
  | { type: "restore.failed"; id: number; message: string };

export const archiveMachine = setup({
  types: { context: {} as ArchiveContext, events: {} as ArchiveEvent },
  actors: { fetchArchived, restore },
}).createMachine({
  id: "archive",
  initial: "loading",
  context: { cards: [], restoring: [], loadError: null, restoreError: null },
  states: {
    loading: {
      entry: assign({ loadError: null }),
      invoke: {
        src: "fetchArchived",
        onDone: { target: "ready", actions: assign({ cards: ({ event }) => event.output }) },
        onError: { target: "failed", actions: assign({ loadError: ({ event }) => message(event.error) }) },
      },
    },
    failed: { on: { retry: "loading" } },
    ready: {
      on: {
        restore: {
          guard: ({ context, event }) =>
            context.cards.some(c => c.id === event.id) && !context.restoring.includes(event.id),
          actions: enqueueActions(({ context, event, enqueue }) => {
            enqueue.assign({ restoreError: null, restoring: [...context.restoring, event.id] });
            enqueue.spawnChild("restore", { id: `restore-${event.id}`, input: { id: event.id } });
          }),
        },
        "restore.done": {
          actions: [
            assign(({ context, event }) => ({
              cards: context.cards.filter(c => c.id !== event.id),
              restoring: context.restoring.filter(id => id !== event.id),
            })),
            stopChild(({ event }) => `restore-${event.id}`),
          ],
        },
        "restore.failed": {
          actions: [
            assign(({ context, event }) => ({
              restoring: context.restoring.filter(id => id !== event.id),
              restoreError: `restore error: ${event.message}`,
            })),
            stopChild(({ event }) => `restore-${event.id}`),
          ],
        },
      },
    },
  },
});
