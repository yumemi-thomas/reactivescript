import { assign, enqueueActions, fromCallback, fromPromise, setup, stopChild } from "xstate";
import type { EventObject } from "xstate";
import * as api from "../api";
import type { Card, Column, Item } from "../api";
import {
  findCard,
  fromServerCard,
  fromServerItem,
  message,
  moveAllowed,
  moveTarget,
  settle,
  shown,
  type BoardData,
  type ColumnStatus,
  type Direction,
  type Op,
  type OpResult,
} from "./model";

type OpInput = Op;

/** Sends one optimistic change to the server and reports back how it went. */
const mutation = fromCallback<EventObject, OpInput>(({ input: op, sendBack }) => {
  let live = true;
  const run = async (): Promise<OpResult> => {
    switch (op.kind) {
      case "move":
        await api.moveCard(op.id, op.to, op.index);
        return {};
      case "rename":
        await api.renameCard(op.id, op.title);
        return {};
      case "archive":
        await api.archiveCard(op.id);
        return {};
      case "addCard":
        return { card: await api.addCard(op.column, op.title) };
      case "toggle":
        await api.toggleItem(op.cardId, op.itemId, op.done);
        return {};
      case "addItem":
        return { item: await api.addItem(op.cardId, op.text) };
    }
  };
  run().then(
    result => {
      if (live) sendBack({ type: "op.done", seq: op.seq, result });
    },
    (error: unknown) => {
      if (live) sendBack({ type: "op.failed", seq: op.seq, message: message(error) });
    },
  );
  return () => {
    live = false;
  };
});

const fetchCards = fromPromise<Card[], { column: Column }>(({ input }) => api.fetchCards(input.column));
const fetchChecklist = fromPromise<Item[], { cardId: number }>(({ input }) => api.fetchChecklist(input.cardId));

export type Draft = "newCard" | "title" | "item";

export type BoardContext = {
  /** what the server last told us, with accepted changes folded in */
  data: BoardData;
  /** changes shown but not yet settled, oldest first */
  ops: Op[];
  seq: number;
  status: Record<Column, ColumnStatus>;
  loadError: Record<Column, string | null>;
  selectedId: number | null;
  checklistError: string | null;
  errors: { move: string | null; add: string | null; archive: string | null; rename: string | null; item: string | null };
  drafts: Record<Draft, string>;
};

export type BoardEvent =
  | { type: "retry"; column: Column }
  | { type: "move"; id: number; dir: Direction }
  | { type: "addCard" }
  | { type: "select"; id: number }
  | { type: "rename" }
  | { type: "archive" }
  | { type: "toggle"; itemId: number }
  | { type: "addItem" }
  | { type: "retryChecklist" }
  | { type: "draft"; field: Draft; value: string }
  | { type: "op.done"; seq: number; result: OpResult }
  | { type: "op.failed"; seq: number; message: string };

const view = (context: BoardContext) => shown(context.data, context.ops);

type NewOp = Op extends infer O ? (O extends Op ? Omit<O, "seq" | "confirmed"> : never) : never;

export const boardMachine = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: { mutation, fetchCards, fetchChecklist },
  actions: {
    /** shows a change at once and sends it to the server */
    start: enqueueActions(({ context, enqueue }, op: NewOp) => {
      const full = { ...op, seq: context.seq, confirmed: false } as Op;
      enqueue.assign({ ops: [...context.ops, full], seq: context.seq + 1 });
      enqueue.spawnChild("mutation", { id: `op-${full.seq}`, input: full });
    }),
    selectCard: assign(({ context, event }) => {
      if (event.type !== "select") return {};
      return {
        selectedId: event.id,
        data: { ...context.data, checklist: null },
        checklistError: null,
        errors: { ...context.errors, rename: null, item: null },
        drafts: { ...context.drafts, title: "", item: "" },
      };
    }),
    clearError: assign(({ context }, kind: keyof BoardContext["errors"]) => ({
      errors: { ...context.errors, [kind]: null },
    })),
  },
  guards: {
    canSelect: ({ context, event }) => {
      if (event.type !== "select" || context.selectedId === event.id) return false;
      const at = findCard(view(context), event.id);
      return !!at && !at.card.adding;
    },
    hasDraft: ({ context }, field: Draft) => context.drafts[field].trim() !== "",
  },
}).createMachine({
  id: "board",
  type: "parallel",
  context: {
    data: { cols: { todo: [], doing: [], done: [] }, checklist: null },
    ops: [],
    seq: 0,
    status: { todo: "loading", doing: "loading", done: "loading" },
    loadError: { todo: null, doing: null, done: null },
    selectedId: null,
    checklistError: null,
    errors: { move: null, add: null, archive: null, rename: null, item: null },
    drafts: { newCard: "", title: "", item: "" },
  },
  on: {
    draft: {
      actions: assign(({ context, event }) => ({ drafts: { ...context.drafts, [event.field]: event.value } })),
    },
    move: {
      guard: ({ context, event }) => moveAllowed(view(context), context.status, event.id, event.dir),
      actions: [
        { type: "clearError", params: "move" },
        enqueueActions(({ context, event, enqueue }) => {
          const t = moveTarget(view(context), event.id, event.dir);
          if (t) enqueue({ type: "start", params: { kind: "move", id: event.id, to: t.to, index: t.index } });
        }),
      ],
    },
    addCard: {
      guard: { type: "hasDraft", params: "newCard" },
      actions: [
        { type: "clearError", params: "add" },
        enqueueActions(({ context, enqueue }) => {
          enqueue({ type: "start", params: { kind: "addCard", column: "todo", title: context.drafts.newCard.trim() } });
          enqueue.assign({ drafts: { ...context.drafts, newCard: "" } });
        }),
      ],
    },
    "op.done": {
      actions: [
        assign(({ context, event }) => {
          const ops = context.ops.map(op => {
            if (op.seq !== event.seq) return op;
            if (op.kind === "addCard") return { ...op, confirmed: true, result: event.result.card };
            if (op.kind === "addItem") return { ...op, confirmed: true, result: event.result.item };
            return { ...op, confirmed: true };
          });
          return settle(context.data, ops);
        }),
        stopChild(({ event }) => `op-${event.seq}`),
      ],
    },
    "op.failed": {
      actions: [
        assign(({ context, event }) => {
          const op = context.ops.find(o => o.seq === event.seq);
          if (!op) return {};
          const errors = { ...context.errors };
          switch (op.kind) {
            case "move":
              errors.move = `move error: ${event.message}`;
              break;
            case "addCard":
              errors.add = `add error: ${event.message}`;
              break;
            case "archive":
              errors.archive = `archive error: ${event.message}`;
              break;
            case "rename":
              if (context.selectedId === op.id) errors.rename = `rename error: ${event.message}`;
              break;
            case "toggle":
            case "addItem":
              if (context.selectedId === op.cardId) errors.item = `item error: ${event.message}`;
              break;
          }
          return { errors, ...settle(context.data, context.ops.filter(o => o.seq !== event.seq)) };
        }),
        stopChild(({ event }) => `op-${event.seq}`),
      ],
    },
  },
  states: {
    todo: {
      initial: "loading",
      states: {
        loading: {
          entry: assign(({ context }) => ({ status: { ...context.status, todo: "loading" as const } })),
          invoke: {
            src: "fetchCards",
            input: { column: "todo" },
            onDone: {
              target: "ready",
              actions: assign(({ context, event }) => ({
                data: { ...context.data, cols: { ...context.data.cols, todo: event.output.map(fromServerCard) } },
                status: { ...context.status, todo: "ready" as const },
              })),
            },
            onError: {
              target: "failed",
              actions: assign(({ context, event }) => ({
                status: { ...context.status, todo: "error" as const },
                loadError: { ...context.loadError, todo: message(event.error) },
              })),
            },
          },
        },
        failed: { on: { retry: { guard: ({ event }) => event.column === "todo", target: "loading" } } },
        ready: {},
      },
    },
    doing: {
      initial: "loading",
      states: {
        loading: {
          entry: assign(({ context }) => ({ status: { ...context.status, doing: "loading" as const } })),
          invoke: {
            src: "fetchCards",
            input: { column: "doing" },
            onDone: {
              target: "ready",
              actions: assign(({ context, event }) => ({
                data: { ...context.data, cols: { ...context.data.cols, doing: event.output.map(fromServerCard) } },
                status: { ...context.status, doing: "ready" as const },
              })),
            },
            onError: {
              target: "failed",
              actions: assign(({ context, event }) => ({
                status: { ...context.status, doing: "error" as const },
                loadError: { ...context.loadError, doing: message(event.error) },
              })),
            },
          },
        },
        failed: { on: { retry: { guard: ({ event }) => event.column === "doing", target: "loading" } } },
        ready: {},
      },
    },
    done: {
      initial: "loading",
      states: {
        loading: {
          entry: assign(({ context }) => ({ status: { ...context.status, done: "loading" as const } })),
          invoke: {
            src: "fetchCards",
            input: { column: "done" },
            onDone: {
              target: "ready",
              actions: assign(({ context, event }) => ({
                data: { ...context.data, cols: { ...context.data.cols, done: event.output.map(fromServerCard) } },
                status: { ...context.status, done: "ready" as const },
              })),
            },
            onError: {
              target: "failed",
              actions: assign(({ context, event }) => ({
                status: { ...context.status, done: "error" as const },
                loadError: { ...context.loadError, done: message(event.error) },
              })),
            },
          },
        },
        failed: { on: { retry: { guard: ({ event }) => event.column === "done", target: "loading" } } },
        ready: {},
      },
    },
    detail: {
      initial: "none",
      states: {
        none: {
          entry: assign(({ context }) => ({ selectedId: null, data: { ...context.data, checklist: null } })),
          on: { select: {
            guard: "canSelect",
            target: "selected",
                        actions: "selectCard",
          },
          },
        },
        selected: {
          initial: "loading",
          on: {
            select: {
            guard: "canSelect",
            target: "selected",
            reenter: true,
            actions: "selectCard",
          },
            rename: {
              guard: { type: "hasDraft", params: "title" },
              actions: [
                { type: "clearError", params: "rename" },
                enqueueActions(({ context, enqueue }) => {
                  if (context.selectedId === null) return;
                  enqueue({
                    type: "start",
                    params: { kind: "rename", id: context.selectedId, title: context.drafts.title.trim() },
                  });
                }),
              ],
            },
            archive: {
              target: "none",
              actions: [
                { type: "clearError", params: "archive" },
                enqueueActions(({ context, enqueue }) => {
                  if (context.selectedId === null) return;
                  enqueue({ type: "start", params: { kind: "archive", id: context.selectedId } });
                }),
              ],
            },
            addItem: {
              guard: { type: "hasDraft", params: "item" },
              actions: [
                { type: "clearError", params: "item" },
                enqueueActions(({ context, enqueue }) => {
                  if (context.selectedId === null) return;
                  enqueue({
                    type: "start",
                    params: { kind: "addItem", cardId: context.selectedId, text: context.drafts.item.trim() },
                  });
                  enqueue.assign({ drafts: { ...context.drafts, item: "" } });
                }),
              ],
            },
            toggle: {
              actions: [
                { type: "clearError", params: "item" },
                enqueueActions(({ context, event, enqueue }) => {
                  const cardId = context.selectedId;
                  const item = view(context).checklist?.items.find(i => i.id === event.itemId);
                  if (cardId === null || !item || item.adding) return;
                  enqueue({
                    type: "start",
                    params: { kind: "toggle", cardId, itemId: event.itemId, done: !item.done, prev: item.done },
                  });
                }),
              ],
            },
          },
          states: {
            loading: {
              invoke: {
                src: "fetchChecklist",
                input: ({ context }) => ({ cardId: context.selectedId ?? -1 }),
                onDone: {
                  target: "ready",
                  actions: assign(({ context, event }) => ({
                    data:
                      context.selectedId === null
                        ? context.data
                        : {
                            ...context.data,
                            checklist: { cardId: context.selectedId, items: event.output.map(fromServerItem) },
                          },
                  })),
                },
                onError: {
                  target: "failed",
                  actions: assign({ checklistError: ({ event }) => message(event.error) }),
                },
              },
            },
            failed: {
              on: {
                retryChecklist: { target: "loading", actions: assign({ checklistError: null }) },
              },
            },
            ready: {},
          },
        },
      },
    },
  },
});
