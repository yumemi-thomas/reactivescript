import { fromPromise, sendParent, setup } from 'xstate';
import * as api from '../api.js';
import type { Issue } from '../api.js';
import { messageOf } from '../errors.js';

/** A server request that changes data. Each one runs in its own child actor. */
export type Op =
  | { kind: 'assign'; id: number; user: string; previous: string | null | undefined; source: 'row' | 'detail' }
  | { kind: 'rename'; id: number; title: string; previous: string | undefined }
  | { kind: 'close'; id: number; issue: Issue | undefined; index: number; source: 'row' | 'detail' }
  | { kind: 'post'; id: number; key: number; author: string; text: string }
  | { kind: 'addLabel'; id: number; label: string }
  | { kind: 'removeLabel'; id: number; label: string; index: number };

let opSeq = 0;
export const newOpId = (): string => `op-${++opSeq}`;

export function runOp(op: Op): Promise<unknown> {
  switch (op.kind) {
    case 'assign':
      return api.assign(op.id, op.user);
    case 'rename':
      return api.renameIssue(op.id, op.title);
    case 'close':
      return api.closeIssue(op.id);
    case 'post':
      return api.addComment(op.id, op.author, op.text);
    case 'addLabel':
      return api.addLabel(op.id, op.label);
    case 'removeLabel':
      return api.removeLabel(op.id, op.label);
  }
}

/** Runs one request and reports its outcome to the page that started it. */
export const opMachine = setup({
  types: {
    context: {} as { op: Op },
    input: {} as Op,
  },
  actors: {
    run: fromPromise<unknown, Op>(({ input }) => runOp(input)),
  },
}).createMachine({
  id: 'op',
  initial: 'running',
  context: ({ input }) => ({ op: input }),
  states: {
    running: {
      invoke: {
        src: 'run',
        input: ({ context }) => context.op,
        onDone: {
          target: 'settled',
          actions: sendParent(({ context }) => ({ type: 'opSucceeded' as const, op: context.op })),
        },
        onError: {
          target: 'settled',
          actions: sendParent(({ context, event }) => ({
            type: 'opFailed' as const,
            op: context.op,
            message: messageOf(event.error),
          })),
        },
      },
    },
    settled: { type: 'final' },
  },
});
