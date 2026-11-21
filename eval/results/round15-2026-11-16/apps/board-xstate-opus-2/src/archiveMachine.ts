import { assign, enqueueActions, fromPromise, setup } from 'xstate';
import * as api from './api.js';
import type { Archived } from './api.js';
import { errorMessage, opMachine, type OpEvent } from './ops';

type PendingRestore = { opId: string; id: number };

export type ArchiveContext = {
  /** Archived cards as the server last confirmed them. */
  archived: Archived[];
  /** Restores taken off the list but not answered yet. */
  pending: PendingRestore[];
  nextOp: number;
  loadError: string | null;
  restoreError: string | null;
};

export type ArchiveEvent = { type: 'card.restore'; id: number } | { type: 'retry' } | OpEvent;

export const archiveMachine = setup({
  types: {
    context: {} as ArchiveContext,
    events: {} as ArchiveEvent,
  },
  actors: {
    fetchArchived: fromPromise<Archived[]>(() => api.fetchArchived()),
    op: opMachine,
  },
}).createMachine({
  id: 'archive',
  context: { archived: [], pending: [], nextOp: 0, loadError: null, restoreError: null },
  initial: 'loading',
  states: {
    loading: {
      entry: assign({ loadError: null }),
      invoke: {
        src: 'fetchArchived',
        onDone: { target: 'ready', actions: assign({ archived: ({ event }) => event.output }) },
        onError: { target: 'failed', actions: assign({ loadError: ({ event }) => errorMessage(event.error) }) },
      },
    },
    failed: {
      on: { retry: 'loading' },
    },
    ready: {
      on: {
        'card.restore': {
          actions: enqueueActions(({ context, event, enqueue }) => {
            const shown = context.archived.some(a => a.id === event.id) && !context.pending.some(p => p.id === event.id);
            if (!shown) return;
            const opId = `restore-${context.nextOp}`;
            enqueue.assign({
              pending: [...context.pending, { opId, id: event.id }],
              nextOp: context.nextOp + 1,
              restoreError: null,
            });
            enqueue.spawnChild('op', { id: opId, input: { opId, request: { type: 'restoreCard', id: event.id } } });
          }),
        },
        'op.done': {
          actions: assign(({ context, event }) => {
            const op = context.pending.find(p => p.opId === event.opId);
            if (!op) return {};
            return {
              pending: context.pending.filter(p => p !== op),
              archived: context.archived.filter(a => a.id !== op.id),
            };
          }),
        },
        'op.failed': {
          actions: assign(({ context, event }) => {
            const op = context.pending.find(p => p.opId === event.opId);
            if (!op) return {};
            return { pending: context.pending.filter(p => p !== op), restoreError: event.message };
          }),
        },
      },
    },
  },
});

export function shownArchived(context: ArchiveContext): Archived[] {
  return context.archived.filter(a => !context.pending.some(p => p.id === a.id));
}
