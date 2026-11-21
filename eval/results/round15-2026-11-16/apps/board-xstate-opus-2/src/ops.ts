import { fromPromise, sendParent, setup } from 'xstate';
import * as api from './api.js';
import type { Column } from './api.js';

/** A server write, described as data so a machine can hold it and replay it. */
export type Request =
  | { type: 'moveCard'; id: number; column: Column; index: number }
  | { type: 'renameCard'; id: number; title: string }
  | { type: 'addCard'; column: Column; title: string }
  | { type: 'archiveCard'; id: number }
  | { type: 'toggleItem'; cardId: number; itemId: number; done: boolean }
  | { type: 'addItem'; cardId: number; text: string }
  | { type: 'restoreCard'; id: number };

function perform(request: Request): Promise<unknown> {
  switch (request.type) {
    case 'moveCard':
      return api.moveCard(request.id, request.column, request.index);
    case 'renameCard':
      return api.renameCard(request.id, request.title);
    case 'addCard':
      return api.addCard(request.column, request.title);
    case 'archiveCard':
      return api.archiveCard(request.id);
    case 'toggleItem':
      return api.toggleItem(request.cardId, request.itemId, request.done);
    case 'addItem':
      return api.addItem(request.cardId, request.text);
    case 'restoreCard':
      return api.restoreCard(request.id);
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Events an operation actor sends to its parent when its request settles. */
export type OpEvent =
  | { type: 'op.done'; opId: string; output: unknown }
  | { type: 'op.failed'; opId: string; message: string };

type OpInput = { opId: string; request: Request };

/**
 * One server write in flight. The parent spawns one per user action and
 * hears back with an `op.done` or `op.failed` event carrying the op's id.
 * Stopping the parent (leaving the page) stops it, so a late answer is dropped.
 */
export const opMachine = setup({
  types: {
    input: {} as OpInput,
    context: {} as OpInput,
  },
  actors: {
    request: fromPromise<unknown, Request>(({ input }) => perform(input)),
  },
}).createMachine({
  id: 'op',
  context: ({ input }) => input,
  initial: 'running',
  states: {
    running: {
      invoke: {
        src: 'request',
        input: ({ context }) => context.request,
        onDone: {
          target: 'settled',
          actions: sendParent(({ context, event }): OpEvent => ({
            type: 'op.done',
            opId: context.opId,
            output: event.output,
          })),
        },
        onError: {
          target: 'settled',
          actions: sendParent(({ context, event }): OpEvent => ({
            type: 'op.failed',
            opId: context.opId,
            message: errorMessage(event.error),
          })),
        },
      },
    },
    settled: { type: 'final' },
  },
});
