import { fromCallback, type EventObject } from "xstate";

/** The message of a rejection, whatever was thrown. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : String(error);
}

/**
 * A one-shot server request run as a child actor of the machine that spawns it.
 *
 * Unlike an invoked promise, a request is not tied to a state: several can be in the air at once
 * (optimistic mutations), each reporting back to its parent with its own event. When the parent
 * stops (its page is left), the request's answer is dropped.
 */
export function request<I, O, E extends EventObject>(
  run: (input: I) => Promise<O>,
  onOk: (input: I, output: O) => E,
  onFail: (input: I, message: string) => E,
) {
  return fromCallback<EventObject, I>(({ input, sendBack }) => {
    let live = true;
    run(input).then(
      (output) => {
        if (live) sendBack(onOk(input, output));
      },
      (error: unknown) => {
        if (live) sendBack(onFail(input, errorMessage(error)));
      },
    );
    return () => {
      live = false;
    };
  });
}
