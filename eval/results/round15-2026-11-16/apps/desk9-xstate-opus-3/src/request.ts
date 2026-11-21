import { fromPromise, sendParent, setup } from "xstate";

/** Events a request actor sends to the actor that spawned it. */
export type RequestEvent =
  | { type: "request.done"; seq: number; output: unknown }
  | { type: "request.failed"; seq: number; message: string };

export type RequestInput = { seq: number; run: () => Promise<unknown> };

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * A one-shot server request. Several of them can be in flight at once (one per optimistic change); each reports its
 * answer to its parent tagged with the sequence number the parent gave it. When the parent stops (its page is left),
 * the request actor stops with it and its answer is dropped.
 */
export const requestMachine = setup({
  types: {
    input: {} as RequestInput,
    context: {} as RequestInput,
  },
  actors: {
    run: fromPromise<unknown, () => Promise<unknown>>(({ input }) => input()),
  },
}).createMachine({
  id: "request",
  context: ({ input }) => input,
  initial: "running",
  states: {
    running: {
      invoke: {
        src: "run",
        input: ({ context }) => context.run,
        onDone: {
          target: "settled",
          actions: sendParent(({ context, event }): RequestEvent => ({
            type: "request.done",
            seq: context.seq,
            output: event.output,
          })),
        },
        onError: {
          target: "settled",
          actions: sendParent(({ context, event }): RequestEvent => ({
            type: "request.failed",
            seq: context.seq,
            message: errorMessage(event.error),
          })),
        },
      },
    },
    settled: { type: "final" },
  },
});
