import { assign, setup, spawnChild, stopChild } from "xstate";
import { fetchArchived, restoreCard } from "./api";
import type { Archived } from "./api";
import { requestLogic, type RequestEvent, type RequestInput } from "./request";

type ArchiveCall = { fn: "fetchArchived" } | { fn: "restoreCard"; id: number };
type ArchivePending = { kind: "load" } | { kind: "restore"; row: Archived; index: number };
type ArchiveInFlight = { call: ArchiveCall; meta: ArchivePending };

export type ArchiveContext = {
  list: { status: "loading" } | { status: "loaded" } | { status: "failed"; message: string };
  rows: Archived[];
  restoreError?: string;
  pending: Record<string, ArchiveInFlight>;
  seq: number;
};

export type ArchiveEvent = { type: "RESTORE"; id: number } | RequestEvent;

type Ev<T extends ArchiveEvent["type"]> = Extract<ArchiveEvent, { type: T }>;
type Outcome = { ok: true; output: unknown } | { ok: false; message: string };

function perform(call: ArchiveCall): Promise<unknown> {
  return call.fn === "fetchArchived" ? fetchArchived() : restoreCard(call.id);
}

/** Records a request under the context's next counter value; the spawn after it names it with `requestIdOf`. */
function launch(ctx: ArchiveContext, call: ArchiveCall, meta: ArchivePending, next: Partial<ArchiveContext> = {}): Partial<ArchiveContext> {
  const requestId = `r${ctx.seq}`;
  return { ...next, seq: ctx.seq + 1, pending: { ...ctx.pending, [requestId]: { call, meta } } };
}

const requestIdOf = (ctx: ArchiveContext) => `r${ctx.seq - 1}`;

function requestInput(ctx: ArchiveContext): RequestInput {
  const requestId = requestIdOf(ctx);
  const call = ctx.pending[requestId].call;
  return { requestId, run: () => perform(call) };
}

function planRestore(ctx: ArchiveContext, event: Ev<"RESTORE">) {
  if (ctx.list.status !== "loaded") return undefined;
  const index = ctx.rows.findIndex((r) => r.id === event.id);
  if (index < 0) return undefined;
  return {
    call: { fn: "restoreCard", id: event.id } as ArchiveCall,
    meta: { kind: "restore", row: ctx.rows[index], index } as ArchivePending,
    next: { rows: ctx.rows.filter((r) => r.id !== event.id), restoreError: undefined },
  };
}

/** Settles one answered request. */
function settle(ctx: ArchiveContext, requestId: string, outcome: Outcome): Partial<ArchiveContext> {
  const inFlight = ctx.pending[requestId];
  if (!inFlight) return {};
  const pending = { ...ctx.pending };
  delete pending[requestId];
  const meta = inFlight.meta;
  if (meta.kind === "load") {
    if (!outcome.ok) return { pending, list: { status: "failed", message: outcome.message } };
    return { pending, list: { status: "loaded" }, rows: outcome.output as Archived[] };
  }
  if (outcome.ok) return { pending };
  // The server declined the restore: the row comes back where it was.
  const rows = [...ctx.rows];
  rows.splice(Math.min(meta.index, rows.length), 0, meta.row);
  return { pending, rows, restoreError: `restore error: ${outcome.message}` };
}

/** The archive page: the archived cards, with restore taking a row off the list at once. */
export const archiveMachine = setup({
  types: {
    context: {} as ArchiveContext,
    events: {} as ArchiveEvent,
  },
  actors: { request: requestLogic },
}).createMachine({
  id: "archive",
  context: { list: { status: "loading" }, rows: [], pending: {}, seq: 1 },
  entry: [
    assign(({ context }) => launch(context, { fn: "fetchArchived" }, { kind: "load" })),
    spawnChild("request", {
      id: ({ context }) => requestIdOf(context),
      input: ({ context }) => requestInput(context),
    }),
  ],
  on: {
    RESTORE: {
      guard: ({ context, event }) => planRestore(context, event) !== undefined,
      actions: [
        assign(({ context, event }) => {
          const plan = planRestore(context, event);
          if (!plan) return {};
          return launch(context, plan.call, plan.meta, plan.next);
        }),
        spawnChild("request", {
          id: ({ context }) => requestIdOf(context),
          input: ({ context }) => requestInput(context),
        }),
      ],
    },

    "request.ok": {
      actions: [
        stopChild(({ event }) => event.requestId),
        assign(({ context, event }) => settle(context, event.requestId, { ok: true, output: event.output })),
      ],
    },

    "request.fail": {
      actions: [
        stopChild(({ event }) => event.requestId),
        assign(({ context, event }) => settle(context, event.requestId, { ok: false, message: event.message })),
      ],
    },
  },
});
