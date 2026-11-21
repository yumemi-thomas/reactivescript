import { fromPromise, sendParent, setup } from "xstate";
import { errorMessage, type ArchivedRow, type CardView, type Place } from "./model";

/** What a server request was for, so the parent can apply or roll back its optimistic change. */
export type RequestMeta =
  | { kind: "move"; id: number; from: Place; to: Place }
  | { kind: "rename"; id: number; previous: string }
  | { kind: "archive"; card: CardView; from: Place }
  | { kind: "add"; key: string }
  | { kind: "toggle"; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; cardId: number; key: string }
  | { kind: "restore"; row: ArchivedRow; index: number };

export type RequestInput = { meta: RequestMeta; run: () => Promise<unknown> };

/**
 * One server request. It runs `run`, then reports to its parent exactly once
 * with `request.succeeded` or `request.failed`, and finishes.
 */
export const requestMachine = setup({
  types: {
    input: {} as RequestInput,
    context: {} as RequestInput,
  },
  actors: {
    call: fromPromise<unknown, () => Promise<unknown>>(({ input }) => input()),
  },
}).createMachine({
  context: ({ input }) => input,
  initial: "sending",
  states: {
    sending: {
      invoke: {
        src: "call",
        input: ({ context }) => context.run,
        onDone: {
          target: "settled",
          actions: sendParent(({ context, event }) => ({
            type: "request.succeeded" as const,
            meta: context.meta,
            result: event.output,
          })),
        },
        onError: {
          target: "settled",
          actions: sendParent(({ context, event }) => ({
            type: "request.failed" as const,
            meta: context.meta,
            message: errorMessage(event.error),
          })),
        },
      },
    },
    settled: { type: "final" },
  },
});

/** Child id and input for a request, from the parent's sequence number. */
export function startRequest(seq: number, meta: RequestMeta, run: () => Promise<unknown>) {
  return { id: `req-${seq}`, input: { meta, run } satisfies RequestInput };
}
