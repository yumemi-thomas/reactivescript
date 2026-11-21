import { fromPromise, sendParent, setup } from "xstate";

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * A one-shot server request, spawned by a page machine for a write that may run
 * alongside others. It reports back to its parent as `<name>.done` (with the
 * request's input and the server's answer) or `<name>.failed` (with the input and
 * the error message), then stops. When the parent stops, so does the request, and
 * its answer is dropped.
 */
export function requestMachine<TInput extends object, TOutput>(
  name: string,
  run: (input: TInput) => Promise<TOutput>,
) {
  return setup({
    types: {
      input: {} as object,
      context: {} as { input: object },
    },
    actors: {
      // the parent declares the answer's type on its `<name>.done` event
      run: fromPromise<unknown, object>(({ input }) => run(input as TInput)),
    },
  }).createMachine({
    id: name,
    context: ({ input }) => ({ input }),
    initial: "running",
    states: {
      running: {
        invoke: {
          src: "run",
          input: ({ context }) => context.input,
          onDone: {
            target: "settled",
            actions: sendParent(({ context, event }) => ({
              type: `${name}.done`,
              input: context.input,
              output: event.output,
            })),
          },
          onError: {
            target: "settled",
            actions: sendParent(({ context, event }) => ({
              type: `${name}.failed`,
              input: context.input,
              message: errorMessage(event.error),
            })),
          },
        },
      },
      settled: { type: "final" },
    },
  });
}
