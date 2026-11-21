import { assign, setup } from "xstate";
import { fetchArchived, restoreCard, type Archived } from "../api.js";
import { requestMachine, type RequestResult, type Settled } from "./request";

type Pending = { kind: "load" } | { kind: "restore"; item: Archived; index: number };

export type ArchiveContext = {
  status: "loading" | "loaded" | "failed";
  list: Archived[];
  message: string;
  restoreError: string | null;
  requests: Record<string, Pending>;
  nextRequest: number;
};

export type ArchiveEvent = { type: "RESTORE"; id: number } | Settled;

const initialContext: ArchiveContext = {
  status: "loading",
  list: [],
  message: "",
  restoreError: null,
  requests: {},
  nextRequest: 0,
};

function settle(ctx: ArchiveContext, id: string, result: RequestResult): ArchiveContext {
  const pending = ctx.requests[id];
  const requests = { ...ctx.requests };
  delete requests[id];
  const next: ArchiveContext = { ...ctx, requests };
  if (!pending) return next;

  if (pending.kind === "load") {
    if (result.ok) return { ...next, status: "loaded", list: result.value as Archived[] };
    return { ...next, status: "failed", message: result.message };
  }
  // restore
  if (result.ok) return next;
  const list = [...next.list];
  list.splice(Math.min(pending.index, list.length), 0, pending.item);
  return { ...next, list, restoreError: `restore error: ${result.message}` };
}

/** The archive page: loads the archived cards, and restores them one by one. */
export const archiveMachine = setup({
  types: {
    context: {} as ArchiveContext,
    events: {} as ArchiveEvent,
  },
  actors: { request: requestMachine },
}).createMachine({
  id: "archive",
  context: initialContext,

  entry: assign(({ context, spawn }) => {
    const id = `r${context.nextRequest}`;
    spawn("request", { id, input: { requestId: id, run: () => fetchArchived() } });
    const pending: Pending = { kind: "load" };
    return { ...context, nextRequest: context.nextRequest + 1, requests: { ...context.requests, [id]: pending } };
  }),

  on: {
    settled: {
      actions: assign(({ context, event }) => settle(context, event.requestId, event.result)),
    },

    RESTORE: {
      guard: ({ context, event }) => context.status === "loaded" && context.list.some((a) => a.id === event.id),
      actions: assign(({ context, event, spawn }) => {
        const index = context.list.findIndex((a) => a.id === event.id);
        if (index === -1) return {};
        const item = context.list[index];
        const id = `r${context.nextRequest}`;
        const cardId = event.id;
        spawn("request", { id, input: { requestId: id, run: () => restoreCard(cardId) } });
        const pending: Pending = { kind: "restore", item, index };
        return {
          nextRequest: context.nextRequest + 1,
          requests: { ...context.requests, [id]: pending },
          list: context.list.filter((_, i) => i !== index),
          restoreError: null,
        };
      }),
    },
  },
});
