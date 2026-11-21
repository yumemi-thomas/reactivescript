import { fromPromise, sendParent, setup } from 'xstate';
import * as api from './api';
import type { Column } from './api';

/** One write the app sends to the server. */
export type Request =
  | { kind: 'moveCard'; id: number; column: Column; index: number }
  | { kind: 'renameCard'; id: number; title: string }
  | { kind: 'addCard'; column: Column; title: string }
  | { kind: 'archiveCard'; id: number }
  | { kind: 'toggleItem'; cardId: number; itemId: number; done: boolean }
  | { kind: 'addItem'; cardId: number; text: string }
  | { kind: 'restoreCard'; id: number };

/** What a settled request reports to the actor that spawned it. */
export type RequestEvent =
  | { type: 'op.ok'; opId: number; newId: number | null }
  | { type: 'op.fail'; opId: number; message: string };

export type RequestInput = { opId: number; request: Request };

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Sends the request; resolves with the new id for requests that create something. */
async function perform(request: Request): Promise<number | null> {
  switch (request.kind) {
    case 'moveCard':
      await api.moveCard(request.id, request.column, request.index);
      return null;
    case 'renameCard':
      await api.renameCard(request.id, request.title);
      return null;
    case 'addCard':
      return (await api.addCard(request.column, request.title)).id;
    case 'archiveCard':
      await api.archiveCard(request.id);
      return null;
    case 'toggleItem':
      await api.toggleItem(request.cardId, request.itemId, request.done);
      return null;
    case 'addItem':
      return (await api.addItem(request.cardId, request.text)).id;
    case 'restoreCard':
      await api.restoreCard(request.id);
      return null;
  }
}

/**
 * A single server write, spawned by a page machine for each optimistic change.
 * It reports back to its parent with `op.ok` or `op.fail`; when the parent
 * stops (the page is left) the request's answer is dropped with it.
 */
export const requestMachine = setup({
  types: {
    input: {} as RequestInput,
    context: {} as RequestInput,
  },
  actors: {
    perform: fromPromise<number | null, Request>(({ input }) => perform(input)),
  },
}).createMachine({
  id: 'request',
  context: ({ input }) => input,
  initial: 'inFlight',
  states: {
    inFlight: {
      invoke: {
        src: 'perform',
        input: ({ context }) => context.request,
        onDone: {
          target: 'settled',
          actions: sendParent(({ context, event }): RequestEvent => ({
            type: 'op.ok',
            opId: context.opId,
            newId: event.output,
          })),
        },
        onError: {
          target: 'settled',
          actions: sendParent(({ context, event }): RequestEvent => ({
            type: 'op.fail',
            opId: context.opId,
            message: errorMessage(event.error),
          })),
        },
      },
    },
    settled: { type: 'final' },
  },
});
