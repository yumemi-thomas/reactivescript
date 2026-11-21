import { fromCallback, type EventObject } from "xstate";

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type OpInput = { opId: string; run: () => Promise<unknown> };

/**
 * Runs one server request in the background and reports the outcome to the
 * parent machine, tagged with the op id, so that the parent can settle the
 * optimistic change it made when the request started.
 */
export const runOp = fromCallback<EventObject, OpInput>(({ input, sendBack }) => {
  input.run().then(
    (value) => sendBack({ type: "OP_DONE", opId: input.opId, value }),
    (error: unknown) => sendBack({ type: "OP_FAILED", opId: input.opId, message: messageOf(error) }),
  );
});
