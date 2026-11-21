import { fromPromise, sendParent, setup } from "xstate";
import { errorMessage } from "./model";

/** Events a request machine sends its parent when its request settles. */
export type RequestEvent<TResult> =
  | { type: "request.ok"; opId: number; result: TResult }
  | { type: "request.failed"; opId: number; message: string };

const requestMachine = setup({
  types: {
    input: {} as { opId: number; request: unknown },
    context: {} as { opId: number; request: unknown },
  },
  actors: {
    perform: fromPromise<unknown, { request: unknown }>(() => Promise.reject(new Error("no request logic provided"))),
  },
}).createMachine({
  id: "request",
  context: ({ input }) => input,
  initial: "running",
  states: {
    running: {
      invoke: {
        src: "perform",
        input: ({ context }) => ({ request: context.request }),
        onDone: {
          target: "settled",
          actions: sendParent(({ context, event }) => ({
            type: "request.ok",
            opId: context.opId,
            result: event.output,
          })),
        },
        onError: {
          target: "settled",
          actions: sendParent(({ context, event }) => ({
            type: "request.failed",
            opId: context.opId,
            message: errorMessage(event.error),
          })),
        },
      },
    },
    settled: { type: "final" },
  },
});

/**
 * A machine that runs one server request and tells its parent how it went (a RequestEvent<TResult>).
 * The parent spawns one per change; if the parent stops (the page is left), the child stops with it
 * and its answer is dropped.
 */
export function createRequestMachine<TRequest, TResult>(perform: (request: TRequest) => Promise<TResult>) {
  return requestMachine.provide({
    actors: { perform: fromPromise<unknown, { request: unknown }>(({ input }) => perform(input.request as TRequest)) },
  });
}
