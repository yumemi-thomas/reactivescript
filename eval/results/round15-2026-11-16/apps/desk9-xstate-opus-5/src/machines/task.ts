import { fromPromise, sendParent, setup } from "xstate";

/** The message a failed request should show. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "something went wrong";
}

/** Events a task actor sends to the actor that spawned it. */
export type TaskEvent =
  | { type: "task.done"; taskId: number; output: unknown }
  | { type: "task.failed"; taskId: number; message: string };

type TaskInput = { taskId: number; run: () => Promise<unknown> };

/**
 * One server request in flight (a mutation), spawned by a page machine. It reports back to
 * its parent with `task.done` / `task.failed`; if the parent is stopped, the answer is dropped.
 */
export const taskMachine = setup({
  types: {
    input: {} as TaskInput,
    context: {} as TaskInput,
  },
  actors: {
    request: fromPromise<unknown, { run: () => Promise<unknown> }>(({ input }) => input.run()),
  },
}).createMachine({
  id: "task",
  context: ({ input }) => input,
  initial: "running",
  states: {
    running: {
      invoke: {
        src: "request",
        input: ({ context }) => ({ run: context.run }),
        onDone: {
          target: "settled",
          actions: sendParent(({ context, event }): TaskEvent => ({
            type: "task.done",
            taskId: context.taskId,
            output: event.output,
          })),
        },
        onError: {
          target: "settled",
          actions: sendParent(({ context, event }): TaskEvent => ({
            type: "task.failed",
            taskId: context.taskId,
            message: errorMessage(event.error),
          })),
        },
      },
    },
    settled: { type: "final" },
  },
});
