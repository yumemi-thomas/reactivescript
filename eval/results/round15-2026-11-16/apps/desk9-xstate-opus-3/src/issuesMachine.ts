import { assign, enqueueActions, fromPromise, sendParent, setup } from "xstate";
import * as api from "./api.js";
import type { Issue } from "./api.js";
import { detailMachine } from "./detailMachine";
import { errorMessage, requestMachine, type RequestEvent } from "./request";

export type Filter = "open" | "closed";
type Origin = "detail" | "row";

/** A change shown on screen before the server has answered it. */
export type ListOp = { seq: number; id: number; origin: Origin; selToken: number } & (
  | { kind: "assign"; assignee: string }
  | { kind: "rename"; title: string }
  | { kind: "close" }
);

/** A change the server accepted; kept until a list fetched after it has loaded, so an older fetch cannot undo it. */
type Confirmed = { seq: number; at: number; id: number } & (
  | { kind: "assign"; assignee: string }
  | { kind: "rename"; title: string }
  | { kind: "close" }
);

export type IssuesContext = {
  user: string;
  filter: Filter;
  listReady: boolean;
  base: Issue[];
  listError: string | null;
  listStartedAt: number;
  clock: number;
  ops: ListOp[];
  confirmed: Confirmed[];
  nextSeq: number;
  selected: number | null;
  selToken: number;
  titleDraft: string;
  assignError: string | null;
  renameError: string | null;
  closeError: string | null;
  rowError: string | null;
};

export type IssuesEvent =
  | { type: "user.change"; value: string }
  | { type: "filter.set"; filter: Filter }
  | { type: "select"; id: number }
  | { type: "title.change"; value: string }
  | { type: "detail.assign" }
  | { type: "detail.rename" }
  | { type: "detail.close" }
  | { type: "row.assign"; id: number }
  | { type: "row.close"; id: number }
  | { type: "related.open"; query: string; hitId: number }
  | RequestEvent;

export type IssuesParentEvent =
  | { type: "openCount"; count: number }
  | { type: "related.open"; query: string; hitId: number };

function latestConfirmedSeq(confirmed: Confirmed[], id: number, kind: ListOp["kind"]): number {
  let seq = -1;
  for (const c of confirmed) if (c.id === id && c.kind === kind && c.seq > seq) seq = c.seq;
  return seq;
}

function patch(rows: Issue[], change: Confirmed | ListOp, filter: Filter): Issue[] {
  switch (change.kind) {
    case "assign":
      return rows.map(r => (r.id === change.id ? { ...r, assignee: change.assignee } : r));
    case "rename":
      return rows.map(r => (r.id === change.id ? { ...r, title: change.title } : r));
    case "close":
      return filter === "open" ? rows.filter(r => r.id !== change.id) : rows;
  }
}

/** The list as the user sees it: the server's rows with the changes still in flight applied over them. */
export function shownIssues(ctx: IssuesContext): Issue[] {
  let rows = ctx.base;
  for (const op of ctx.ops) {
    // an older change still in flight must not cover a newer one the server already accepted
    if (op.kind !== "close" && op.seq < latestConfirmedSeq(ctx.confirmed, op.id, op.kind)) continue;
    rows = patch(rows, op, ctx.filter);
  }
  return rows;
}

/** The title the heading of issue `id` should show, given the title its detail loaded. */
export function shownTitle(ctx: IssuesContext, id: number, loaded: string): string {
  let title = loaded;
  for (const op of ctx.ops) {
    if (op.kind === "rename" && op.id === id && op.seq > latestConfirmedSeq(ctx.confirmed, id, "rename")) {
      title = op.title;
    }
  }
  return title;
}

function run(op: ListOp): () => Promise<unknown> {
  switch (op.kind) {
    case "assign":
      return () => api.assign(op.id, op.assignee);
    case "rename":
      return () => api.renameIssue(op.id, op.title);
    case "close":
      return () => api.closeIssue(op.id);
  }
}

export const issuesMachine = setup({
  types: {
    context: {} as IssuesContext,
    events: {} as IssuesEvent,
    children: {} as { detail: "detailMachine" },
  },
  actors: {
    fetchIssues: fromPromise<Issue[], Filter>(({ input }) => api.fetchIssues(input)),
    detailMachine,
    request: requestMachine,
  },
  actions: {
    reportCount: sendParent(({ context }): IssuesParentEvent => ({
      type: "openCount",
      count: shownIssues(context).length,
    })),
  },
  guards: {
    showsOpenList: ({ context }) => context.filter === "open" && context.listReady,
  },
}).createMachine({
  id: "issues",
  type: "parallel",
  context: {
    user: "guest",
    filter: "open",
    listReady: false,
    base: [],
    listError: null,
    listStartedAt: 0,
    clock: 0,
    ops: [],
    confirmed: [],
    nextSeq: 0,
    selected: null,
    selToken: 0,
    titleDraft: "",
    assignError: null,
    renameError: null,
    closeError: null,
    rowError: null,
  },
  states: {
    list: {
      initial: "loading",
      on: {
        "filter.set": {
          guard: ({ context, event }) => context.filter !== event.filter,
          // through `start`, so a fetch for the other filter still in flight is dropped
          target: ".start",
          actions: assign({ filter: ({ event }) => event.filter }),
        },
      },
      states: {
        start: { always: "loading" },
        loading: {
          entry: assign(({ context }) => ({
            listReady: false,
            listError: null,
            clock: context.clock + 1,
            listStartedAt: context.clock + 1,
          })),
          invoke: {
            src: "fetchIssues",
            input: ({ context }) => context.filter,
            onDone: {
              target: "loaded",
              actions: [
                assign(({ context, event }) => {
                  const later = context.confirmed.filter(c => c.at > context.listStartedAt);
                  let base = event.output;
                  for (const c of [...later].sort((a, b) => a.seq - b.seq)) base = patch(base, c, context.filter);
                  return { base, confirmed: later, listReady: true };
                }),
                enqueueActions(({ check, enqueue }) => {
                  if (check("showsOpenList")) enqueue("reportCount");
                }),
              ],
            },
            onError: {
              target: "failed",
              actions: assign({ listError: ({ event }) => errorMessage(event.error) }),
            },
          },
        },
        loaded: {},
        failed: {},
      },
    },
    detail: {
      initial: "none",
      on: {
        select: {
          guard: ({ context, event }) => context.selected !== event.id,
          // through `switching`, so the previous issue's detail actor is stopped and a fresh one starts
          target: ".switching",
          actions: assign({
            selected: ({ event }) => event.id,
            selToken: ({ context }) => context.selToken + 1,
            titleDraft: "",
            assignError: null,
            renameError: null,
            closeError: null,
          }),
        },
      },
      states: {
        none: {},
        switching: { always: "selected" },
        selected: {
          invoke: {
            id: "detail",
            src: "detailMachine",
            input: ({ context }) => ({ id: context.selected ?? 0 }),
          },
        },
      },
    },
  },
  on: {
    "user.change": { actions: assign({ user: ({ event }) => event.value }) },
    "title.change": { actions: assign({ titleDraft: ({ event }) => event.value }) },
    "related.open": {
      actions: sendParent(({ event }): IssuesParentEvent => ({
        type: "related.open",
        query: event.query,
        hitId: event.hitId,
      })),
    },
    "detail.assign": {
      guard: ({ context }) => context.selected !== null && context.user.trim() !== "",
      actions: [
        assign({ assignError: null }),
        enqueueActions(({ context, enqueue }) => {
          const op: ListOp = {
            seq: context.nextSeq,
            id: context.selected ?? 0,
            origin: "detail",
            selToken: context.selToken,
            kind: "assign",
            assignee: context.user,
          };
          enqueue.assign({ nextSeq: op.seq + 1, ops: [...context.ops, op] });
          enqueue.spawnChild("request", { input: { seq: op.seq, run: run(op) } });
        }),
      ],
    },
    "detail.rename": {
      guard: ({ context }) => context.selected !== null && context.titleDraft.trim() !== "",
      actions: [
        assign({ renameError: null }),
        enqueueActions(({ context, enqueue }) => {
          const op: ListOp = {
            seq: context.nextSeq,
            id: context.selected ?? 0,
            origin: "detail",
            selToken: context.selToken,
            kind: "rename",
            title: context.titleDraft,
          };
          enqueue.assign({ nextSeq: op.seq + 1, ops: [...context.ops, op] });
          enqueue.spawnChild("request", { input: { seq: op.seq, run: run(op) } });
        }),
      ],
    },
    "detail.close": {
      guard: ({ context }) => context.selected !== null,
      actions: [
        assign({ closeError: null }),
        enqueueActions(({ context, enqueue }) => {
          const op: ListOp = {
            seq: context.nextSeq,
            id: context.selected ?? 0,
            origin: "detail",
            selToken: context.selToken,
            kind: "close",
          };
          enqueue.assign({ nextSeq: op.seq + 1, ops: [...context.ops, op] });
          enqueue.spawnChild("request", { input: { seq: op.seq, run: run(op) } });
        }),
        enqueueActions(({ check, enqueue }) => {
          if (check("showsOpenList")) enqueue("reportCount");
        }),
      ],
    },
    "row.assign": {
      guard: ({ context }) => context.user.trim() !== "",
      actions: [
        assign({ rowError: null }),
        enqueueActions(({ context, event, enqueue }) => {
          const op: ListOp = {
            seq: context.nextSeq,
            id: event.id,
            origin: "row",
            selToken: context.selToken,
            kind: "assign",
            assignee: context.user,
          };
          enqueue.assign({ nextSeq: op.seq + 1, ops: [...context.ops, op] });
          enqueue.spawnChild("request", { input: { seq: op.seq, run: run(op) } });
        }),
      ],
    },
    "row.close": {
      actions: [
        assign({ rowError: null }),
        enqueueActions(({ context, event, enqueue }) => {
          const op: ListOp = {
            seq: context.nextSeq,
            id: event.id,
            origin: "row",
            selToken: context.selToken,
            kind: "close",
          };
          enqueue.assign({ nextSeq: op.seq + 1, ops: [...context.ops, op] });
          enqueue.spawnChild("request", { input: { seq: op.seq, run: run(op) } });
        }),
        enqueueActions(({ check, enqueue }) => {
          if (check("showsOpenList")) enqueue("reportCount");
        }),
      ],
    },
    "request.done": {
      actions: [
        enqueueActions(({ context, event, enqueue }) => {
          const op = context.ops.find(o => o.seq === event.seq);
          if (!op) return;
          const ops = context.ops.filter(o => o.seq !== op.seq);
          const at = context.clock + 1;
          let confirmed: Confirmed;
          if (op.kind === "assign") {
            const out = event.output as { assignee?: string } | null;
            confirmed = { seq: op.seq, at, id: op.id, kind: "assign", assignee: out?.assignee ?? op.assignee };
          } else if (op.kind === "rename") {
            const out = event.output as { title?: string } | null;
            confirmed = { seq: op.seq, at, id: op.id, kind: "rename", title: out?.title ?? op.title };
          } else {
            confirmed = { seq: op.seq, at, id: op.id, kind: "close" };
          }
          // an answer that arrives after a newer accepted change of the same kind does not undo it
          const stale = op.kind !== "close" && op.seq < latestConfirmedSeq(context.confirmed, op.id, op.kind);
          enqueue.assign({
            ops,
            clock: at,
            confirmed: [...context.confirmed, confirmed],
            base: stale ? context.base : patch(context.base, confirmed, context.filter),
          });
          if (!stale && confirmed.kind === "rename" && context.selected === op.id) {
            enqueue.sendTo("detail", { type: "title.confirmed", title: confirmed.title });
          }
        }),
        enqueueActions(({ check, enqueue }) => {
          if (check("showsOpenList")) enqueue("reportCount");
        }),
      ],
    },
    "request.failed": {
      actions: [
        enqueueActions(({ context, event, enqueue }) => {
          const op = context.ops.find(o => o.seq === event.seq);
          if (!op) return;
          const ops = context.ops.filter(o => o.seq !== op.seq);
          if (op.origin === "row") {
            enqueue.assign({ ops, rowError: event.message });
          } else if (op.selToken !== context.selToken) {
            // the issue it was made from is no longer selected: its error has been cleared
            enqueue.assign({ ops });
          } else if (op.kind === "assign") {
            enqueue.assign({ ops, assignError: event.message });
          } else if (op.kind === "rename") {
            enqueue.assign({ ops, renameError: event.message });
          } else {
            enqueue.assign({ ops, closeError: event.message });
          }
        }),
        enqueueActions(({ check, enqueue }) => {
          if (check("showsOpenList")) enqueue("reportCount");
        }),
      ],
    },
  },
});
