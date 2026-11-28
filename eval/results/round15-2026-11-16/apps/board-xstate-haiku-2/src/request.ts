import { fromPromise, sendParent, setup } from "xstate";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type RequestInput = { opId: string; run: () => Promise<unknown> };

const runRequest = fromPromise<unknown, { run: () => Promise<unknown> }>(({ input }) => input.run());

/**
 * One server call made on behalf of a page. It reports back to its parent with
 * `opSucceeded` or `opFailed` (carrying the op id) and then finishes, which stops it.
 * The parent keeps the optimistic change and rolls it back on failure.
 */
export const requestMachine = setup({
  types: { input: {} as RequestInput, context: {} as RequestInput },
  actors: { runRequest },
}).createMachine({
  context: ({ input }) => input,
  initial: "running",
  states: {
    running: {
      invoke: {
        src: "runRequest",
        input: ({ context }) => ({ run: context.run }),
        onDone: {
          target: "settled",
          actions: sendParent(({ context, event }) => ({
            type: "opSucceeded" as const,
            opId: context.opId,
            output: event.output,
          })),
        },
        onError: {
          target: "settled",
          actions: sendParent(({ context, event }) => ({
            type: "opFailed" as const,
            opId: context.opId,
            error: errorMessage(event.error),
          })),
        },
      },
    },
    settled: { type: "final" },
  },
});
