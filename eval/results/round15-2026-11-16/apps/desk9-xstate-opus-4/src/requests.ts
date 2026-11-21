import { fromPromise, sendParent, setup } from "xstate";
import * as api from "./api.js";
import type { Comment, Hit, Issue, IssueDetail, Item, Settings } from "./api";

export type IssueFilter = "open" | "closed";
export type Source = "detail" | "row";

/** Every write the app sends to the server, tagged with the sequence number it was started with. */
export type Op =
  | { kind: "assign"; seq: number; id: number; user: string; source: Source; selection: number }
  | { kind: "rename"; seq: number; id: number; title: string; selection: number }
  | { kind: "close"; seq: number; id: number; source: Source; selection: number }
  | { kind: "post"; seq: number; id: number; author: string; text: string; selection: number }
  | { kind: "addLabel"; seq: number; id: number; label: string; selection: number }
  | { kind: "removeLabel"; seq: number; id: number; label: string; selection: number }
  | { kind: "save"; seq: number; settings: Settings };

export type OpResult =
  | { kind: "assign"; value: { id: number; assignee: string } }
  | { kind: "rename"; value: { id: number; title: string } }
  | { kind: "close"; value: { id: number } }
  | { kind: "post"; value: Comment }
  | { kind: "labels"; value: string[] }
  | { kind: "save"; value: Settings };

export type OpSettledEvent =
  | { type: "op.done"; op: Op; result: OpResult }
  | { type: "op.failed"; op: Op; message: string };

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "request failed";
}

async function perform(op: Op): Promise<OpResult> {
  switch (op.kind) {
    case "assign":
      return { kind: "assign", value: await api.assign(op.id, op.user) };
    case "rename":
      return { kind: "rename", value: await api.renameIssue(op.id, op.title) };
    case "close":
      return { kind: "close", value: await api.closeIssue(op.id) };
    case "post":
      return { kind: "post", value: await api.addComment(op.id, op.author, op.text) };
    case "addLabel":
      return { kind: "labels", value: await api.addLabel(op.id, op.label) };
    case "removeLabel":
      return { kind: "labels", value: await api.removeLabel(op.id, op.label) };
    case "save":
      return { kind: "save", value: await api.saveSettings(op.settings) };
  }
}

/**
 * One write to the server. It is spawned by the page that started it, so it
 * outlives state changes of that page, and reports back with `op.done` or
 * `op.failed`. When the page is discarded, the write is stopped with it and its
 * answer is ignored.
 */
export const mutationMachine = setup({
  types: {
    context: {} as { op: Op },
    input: {} as { op: Op },
  },
  actors: {
    perform: fromPromise<OpResult, Op>(({ input }) => perform(input)),
  },
}).createMachine({
  id: "mutation",
  context: ({ input }) => ({ op: input.op }),
  initial: "running",
  states: {
    running: {
      invoke: {
        src: "perform",
        input: ({ context }) => context.op,
        onDone: {
          target: "settled",
          actions: sendParent(({ context, event }): OpSettledEvent => ({
            type: "op.done",
            op: context.op,
            result: event.output,
          })),
        },
        onError: {
          target: "settled",
          actions: sendParent(({ context, event }): OpSettledEvent => ({
            type: "op.failed",
            op: context.op,
            message: errorMessage(event.error),
          })),
        },
      },
    },
    settled: { type: "final" },
  },
});

// Read requests, as promise actors.
export const fetchIssuesLogic = fromPromise<Issue[], { filter: IssueFilter }>(({ input }) =>
  api.fetchIssues(input.filter),
);
export const fetchIssueLogic = fromPromise<IssueDetail | null, { id: number }>(({ input }) =>
  api.fetchIssue(input.id),
);
export const fetchCommentsLogic = fromPromise<Comment[], { id: number }>(({ input }) =>
  api.fetchComments(input.id),
);
export const fetchLabelsLogic = fromPromise<string[], { id: number }>(({ input }) =>
  api.fetchLabels(input.id),
);
export const searchLogic = fromPromise<Hit[], { q: string }>(({ input }) => api.search(input.q));
export const fetchItemLogic = fromPromise<Item | null, { id: number }>(({ input }) => api.fetchItem(input.id));
export const loadSettingsLogic = fromPromise<Settings>(() => api.loadSettings());
