import { assign, enqueueActions, fromPromise, setup } from 'xstate';
import * as api from './api';
import type { Archived } from './api';
import { errorMessage, requestMachine, type RequestEvent } from './request';

export type ArchiveContext = {
  /** the archive as the server has it */
  cards: Archived[];
  /** restores sent and not yet answered */
  restoring: { opId: number; id: number }[];
  nextOpId: number;
  loadError: string | null;
  restoreError: string | null;
};

export type ArchiveEvent = { type: 'restore'; id: number } | { type: 'retry' } | RequestEvent;

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
  id: 'archive',
  context: { cards: [], restoring: [], nextOpId: 1, loadError: null, restoreError: null },
  initial: 'loading',
  on: {
    'op.ok': {
      actions: assign(({ context, event }) => {
        const op = context.restoring.find((r) => r.opId === event.opId);
        if (!op) return {};
        return {
          restoring: context.restoring.filter((r) => r.opId !== event.opId),
          cards: context.cards.filter((c) => c.id !== op.id),
        };
      }),
    },
    'op.fail': {
      actions: assign(({ context, event }) => {
        if (!context.restoring.some((r) => r.opId === event.opId)) return {};
        return {
          restoring: context.restoring.filter((r) => r.opId !== event.opId),
          restoreError: `restore error: ${event.message}`,
        };
      }),
    },
  },
  states: {
    loading: {
      entry: assign({ loadError: null }),
      invoke: {
        src: 'fetchArchived',
        onDone: { target: 'ready', actions: assign({ cards: ({ event }) => event.output }) },
        onError: { target: 'failed', actions: assign({ loadError: ({ event }) => errorMessage(event.error) }) },
      },
    },
    ready: {
      on: {
        restore: {
          actions: enqueueActions(({ context, event, enqueue }) => {
            const id = event.id;
            if (!context.cards.some((c) => c.id === id) || context.restoring.some((r) => r.id === id)) return;
            const opId = context.nextOpId;
            enqueue.assign({
              nextOpId: opId + 1,
              restoring: [...context.restoring, { opId, id }],
              restoreError: null,
            });
            enqueue.spawnChild('request', { id: `op-${opId}`, input: { opId, request: { kind: 'restoreCard', id } } });
          }),
        },
      },
    },
    failed: {
      on: { retry: 'loading' },
    },
  },
});
