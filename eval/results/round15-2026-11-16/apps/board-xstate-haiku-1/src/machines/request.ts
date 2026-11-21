import { fromPromise, sendParent, setup } from "xstate";

/** How one server request ended. */
export type RequestResult = { ok: true; value: unknown } | { ok: false; message: string };

/** Sent to the parent machine when a request settles. */
export type Settled = { type: "settled"; requestId: string; result: RequestResult };

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs one server call as a child actor. The parent spawns one per call, so
 * several calls can be in the air at once; each reports back by its requestId.
 */
export const requestMachine = setup({
  types: {
    input: {} as { requestId: string; run: () => Promise<unknown> },
  },
  actors: {
    call: fromPromise<unknown, () => Promise<unknown>>(({ input }) => input()),
  },
}).createMachine({
  id: "request",
  initial: "running",
  context: ({ input }) => ({ requestId: input.requestId, run: input.run }),
  states: {
    running: {
      invoke: {
        src: "call",
        input: ({ context }) => context.run,
        onDone: {
          target: "settled",
          actions: sendParent(
            ({ context, event }): Settled => ({
              type: "settled",
              requestId: context.requestId,
              result: { ok: true, value: event.output },
            }),
          ),
        },
        onError: {
          target: "settled",
          actions: sendParent(
            ({ context, event }): Settled => ({
              type: "settled",
              requestId: context.requestId,
              result: { ok: false, message: errorMessage(event.error) },
            }),
          ),
        },
      },
    },
    settled: { type: "final" },
  },
});
