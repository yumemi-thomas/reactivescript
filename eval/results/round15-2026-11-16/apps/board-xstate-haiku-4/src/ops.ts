import { fromPromise, sendParent, setup } from "xstate";
import { messageOf } from "./model";
import { runRequest, type Request } from "./requests";

export type OpInput = { opId: string; request: Request };

/**
 * One server call, as an actor. It runs the call and reports the outcome to its parent
 * as `op.done` (with the server's answer) or `op.failed` (with the message), then finishes.
 * A parent runs many of these at once, one per user action, so each action can be
 * shown at once and rolled back on its own.
 */
export const opMachine = setup({
  types: {
    input: {} as OpInput,
    context: {} as { opId: string; request: Request },
  },
  actors: {
    call: fromPromise(({ input }: { input: { request: Request } }) => runRequest(input.request)),
  },
}).createMachine({
  id: "op",
  initial: "running",
  context: ({ input }) => ({ opId: input.opId, request: input.request }),
  states: {
    running: {
      invoke: {
        src: "call",
        input: ({ context }) => ({ request: context.request }),
        onDone: {
          target: "settled",
          actions: sendParent(({ context, event }) => ({ type: "op.done", opId: context.opId, output: event.output })),
        },
        onError: {
          target: "settled",
          actions: sendParent(({ context, event }) => ({
            type: "op.failed",
            opId: context.opId,
            message: messageOf(event.error),
          })),
        },
      },
    },
    settled: { type: "final" },
  },
});
