import { fromPromise, sendParent, setup } from 'xstate';
import * as api from '../api.js';

/** Where a server request was started: the issue's detail pane or a row of the list. */
export type Via = 'detail' | 'row';

/** One server write. Each kind runs as its own child actor, so writes overlap freely. */
export type Req =
  | { kind: 'assign'; via: Via; id: number; user: string }
  | { kind: 'rename'; via: 'detail'; id: number; title: string }
  | { kind: 'close'; via: Via; id: number }
  | { kind: 'comment'; id: number; author: string; text: string }
  | { kind: 'addLabel'; id: number; label: string }
  | { kind: 'removeLabel'; id: number; label: string };

/** A write that has been sent and not yet answered. The UI shows it at once. */
export type Pending = { opId: number; req: Req };

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runReq(req: Req): Promise<unknown> {
  switch (req.kind) {
    case 'assign':
      return api.assign(req.id, req.user);
    case 'rename':
      return api.renameIssue(req.id, req.title);
    case 'close':
      return api.closeIssue(req.id);
    case 'comment':
      return api.addComment(req.id, req.author, req.text);
    case 'addLabel':
      return api.addLabel(req.id, req.label);
    case 'removeLabel':
      return api.removeLabel(req.id, req.label);
  }
}

/**
 * Runs one server write and reports the answer to its parent, which then
 * either keeps the change or drops the overlay it was showing.
 */
export const opMachine = setup({
  types: {
    input: {} as { opId: number; req: Req },
  },
  actors: {
    call: fromPromise<unknown, Req>(({ input }) => runReq(input)),
  },
}).createMachine({
  id: 'op',
  context: ({ input }) => ({ opId: input.opId, req: input.req }),
  initial: 'running',
  states: {
    running: {
      invoke: {
        src: 'call',
        input: ({ context }) => context.req,
        onDone: {
          target: 'settled',
          actions: sendParent(({ context, event }) => ({
            type: 'OP_OK' as const,
            opId: context.opId,
            req: context.req,
            value: event.output,
          })),
        },
        onError: {
          target: 'settled',
          actions: sendParent(({ context, event }) => ({
            type: 'OP_ERR' as const,
            opId: context.opId,
            req: context.req,
            message: errorMessage(event.error),
          })),
        },
      },
    },
    settled: { type: 'final' },
  },
});
