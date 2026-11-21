import { fromCallback, type EventObject } from "xstate";

/** One server call, run by a request actor that a machine spawns. */
export type RequestInput = { requestId: string; run: () => Promise<unknown> };

/** What a request actor reports back to the machine that spawned it. */
export type RequestEvent =
  | { type: "request.ok"; requestId: string; output: unknown }
  | { type: "request.fail"; requestId: string; message: string };

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs one server call and reports the outcome to its parent. The parent stops the actor once it has
 * the outcome. If the actor is stopped first (the page was left), its outcome is dropped.
 */
export const requestLogic = fromCallback<EventObject, RequestInput>(({ input, sendBack }) => {
  let live = true;
  new Promise<unknown>((resolve) => resolve(input.run())).then(
    (output) => {
      if (live) sendBack({ type: "request.ok", requestId: input.requestId, output });
    },
    (error: unknown) => {
      if (live) sendBack({ type: "request.fail", requestId: input.requestId, message: messageOf(error) });
    },
  );
  return () => {
    live = false;
  };
});

