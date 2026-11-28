import { assign, fromPromise, setup } from "xstate";
import * as api from "./api";
import type { Card, Column, Item } from "./api";
import {
  WIP_LIMIT,
  compact,
  errorMessage,
  emptyData,
  fromCard,
  fromItem,
  locate,
  shown,
  type BoardData,
  type Op,
  type PendingOp,
} from "./model";
import { createRequestMachine, type RequestEvent } from "./request";

export type Direction = "left" | "right" | "up" | "down";

export type BoardErrors = {
  move: string | null;
  add: string | null;
  archive: string | null;
  rename: string | null;
  item: string | null;
};

export type BoardContext = {
  /** what the server has told us, with confirmed changes folded in */
  base: BoardData;
  /** changes in play, oldest first */
  ops: PendingOp[];
  nextOpId: number;
  selectedId: number | null;
  columnErrors: Record<Column, string | null>;
  checklistError: string | null;
  errors: BoardErrors;
};

export type BoardEvent =
  | { type: "RETRY"; column: Column }
  | { type: "MOVE"; id: number; dir: Direction }
  | { type: "ADD"; title: string }
  | { type: "SELECT"; id: number }
  | { type: "RENAME"; title: string }
  | { type: "ARCHIVE" }
  | { type: "TOGGLE"; itemId: number }
  | { type: "ADD_ITEM"; text: string }
  | RequestEvent<Op>;

/** Sends one change to the server, answering it as the server confirmed it. */
async function performOp(op: Op): Promise<Op> {
  switch (op.kind) {
    case "move":
      await api.moveCard(op.id, op.column, op.index);
      return op;
    case "add": {
      const r = await api.addCard(op.column, op.title);
      return { ...op, newId: r.id, title: typeof r.title === "string" ? r.title : op.title };
    }
    case "rename": {
      const r = await api.renameCard(op.id, op.title);
      return { ...op, title: typeof r.title === "string" ? r.title : op.title };
    }
    case "archive":
      await api.archiveCard(op.id);
      return op;
    case "toggle": {
      const r = await api.toggleItem(op.cardId, op.itemId, op.done);
      return { ...op, done: typeof r.done === "boolean" ? r.done : op.done };
    }
    case "addItem": {
      const r = await api.addItem(op.cardId, op.text);
      return { ...op, newId: r.id, text: typeof r.text === "string" ? r.text : op.text };
    }
  }
}

export const NEXT_COLUMN: Record<Direction, (c: Column) => Column | null> = {
  left: c => (c === "doing" ? "todo" : c === "done" ? "doing" : null),
  right: c => (c === "todo" ? "doing" : c === "doing" ? "done" : null),
  up: c => c,
  down: c => c,
};

export type MoveButton = { visible: boolean; enabled: boolean };

/** Whether a move is possible on the board as shown, and where it would put the card. */
export function planMove(
  data: BoardData,
  id: number,
  dir: Direction,
): { button: MoveButton; target: { column: Column; index: number } | null } {
  const hidden = { button: { visible: false, enabled: false }, target: null };
  const at = locate(data, id);
  if (!at) return hidden;
  const column = NEXT_COLUMN[dir](at.column);
  if (!column) return hidden;
  if (dir === "up" || dir === "down") {
    const cards = data.columns[at.column]!;
    const index = at.index + (dir === "up" ? -1 : 1);
    if (index < 0 || index >= cards.length) return hidden;
    return { button: { visible: true, enabled: true }, target: { column, index } };
  }
  const target = data.columns[column];
  const doing = data.columns.doing;
  const full = column === "doing" && (!doing || doing.length >= WIP_LIMIT);
  if (!target || full) return { button: { visible: true, enabled: false }, target: null };
  return { button: { visible: true, enabled: true }, target: { column, index: target.length } };
}

const loadCards = fromPromise<Card[], Column>(({ input }) => api.fetchCards(input));
const loadChecklist = fromPromise<Item[], number>(({ input }) => api.fetchChecklist(input));
const requestMachine = createRequestMachine(performOp);

const board = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: { loadCards, loadChecklist, request: requestMachine },
  actions: {
    select: assign(({ context, event }) =>
      event.type === "SELECT"
        ? { selectedId: event.id, checklistError: null, errors: { ...context.errors, rename: null, item: null } }
        : {},
    ),
  },
  guards: {
    canMove: ({ context, event }) =>
      event.type === "MOVE" && planMove(shown(context.base, context.ops), event.id, event.dir).target !== null,
    canAdd: ({ context, event }) =>
      event.type === "ADD" && event.title.trim() !== "" && context.base.columns.todo !== null,
    canSelect: ({ context, event }) =>
      event.type === "SELECT" &&
      event.id !== context.selectedId &&
      locate(shown(context.base, context.ops), event.id) !== null,
    canRename: ({ context, event }) =>
      event.type === "RENAME" &&
      event.title.trim() !== "" &&
      context.selectedId !== null &&
      locate(shown(context.base, context.ops), context.selectedId) !== null,
    canArchive: ({ context }) =>
      context.selectedId !== null && locate(shown(context.base, context.ops), context.selectedId) !== null,
    canToggle: ({ context, event }) => {
      if (event.type !== "TOGGLE" || context.selectedId === null) return false;
      const list = shown(context.base, context.ops).lists[context.selectedId];
      return !!list?.some(i => i.id === event.itemId);
    },
    canAddItem: ({ context, event }) =>
      event.type === "ADD_ITEM" &&
      event.text.trim() !== "" &&
      context.selectedId !== null &&
      context.base.lists[context.selectedId] !== undefined,
  },
});

/** Queues a change: it shows at once, and a request machine takes it to the server. */
const startOp = (clear: keyof BoardErrors, makeOp: (context: BoardContext, event: BoardEvent) => Op | null) =>
  board.enqueueActions(({ context, event, enqueue }) => {
    const op = makeOp(context, event);
    if (!op) return;
    const opId = context.nextOpId;
    enqueue.assign({
      ops: [...context.ops, { opId, op, confirmed: false }],
      nextOpId: opId + 1,
      errors: { ...context.errors, [clear]: null },
    });
    enqueue.spawnChild("request", { id: `op-${opId}`, input: { opId, request: op } });
  });

const columnRegion = (column: Column) =>
  board.createStateConfig({
    initial: "loading",
    states: {
      loading: {
        entry: assign({ columnErrors: ({ context }) => ({ ...context.columnErrors, [column]: null }) }),
        invoke: {
          src: "loadCards",
          input: column,
          onDone: {
            target: "ready",
            actions: assign({
              base: ({ context, event }) => ({
                ...context.base,
                columns: { ...context.base.columns, [column]: event.output.map(fromCard) },
              }),
            }),
          },
          onError: {
            target: "failed",
            actions: assign({
              columnErrors: ({ context, event }) => ({ ...context.columnErrors, [column]: errorMessage(event.error) }),
            }),
          },
        },
      },
      ready: {},
      failed: {
        on: {
          RETRY: { guard: ({ event }) => event.column === column, target: "loading" },
        },
      },
    },
  });

export const boardMachine = board.createMachine({
  id: "board",
  type: "parallel",
  context: {
    base: emptyData(),
    ops: [],
    nextOpId: 1,
    selectedId: null,
    columnErrors: { todo: null, doing: null, done: null },
    checklistError: null,
    errors: { move: null, add: null, archive: null, rename: null, item: null },
  },
  on: {
    MOVE: {
      guard: "canMove",
      actions: startOp("move", (context, event) => {
        if (event.type !== "MOVE") return null;
        const { target } = planMove(shown(context.base, context.ops), event.id, event.dir);
        return target && { kind: "move", id: event.id, column: target.column, index: target.index };
      }),
    },
    ADD: {
      guard: "canAdd",
      actions: startOp("add", (_, event) =>
        event.type === "ADD" ? { kind: "add", column: "todo", title: event.title.trim() } : null,
      ),
    },
    "request.ok": {
      actions: assign(({ context, event }) => {
        const ops = context.ops.map(p =>
          p.opId === event.opId ? { ...p, op: event.result, confirmed: true } : p,
        );
        return compact(context.base, ops);
      }),
    },
    "request.failed": {
      actions: assign(({ context, event }) => {
        const failed = context.ops.find(p => p.opId === event.opId);
        if (!failed) return {};
        const ops = context.ops.filter(p => p !== failed);
        const errors = { ...context.errors };
        const { op } = failed;
        switch (op.kind) {
          case "move":
            errors.move = event.message;
            break;
          case "add":
            errors.add = event.message;
            break;
          case "archive":
            errors.archive = event.message;
            break;
          case "rename":
            if (context.selectedId === op.id) errors.rename = event.message;
            break;
          case "toggle":
          case "addItem":
            if (context.selectedId === op.cardId) errors.item = event.message;
            break;
        }
        return { ...compact(context.base, ops), errors };
      }),
    },
  },
  states: {
    columns: {
      type: "parallel",
      states: {
        todo: columnRegion("todo"),
        doing: columnRegion("doing"),
        done: columnRegion("done"),
      },
    },
    detail: {
      initial: "none",
      states: {
        none: {
          on: { SELECT: { guard: "canSelect", target: "selected", actions: "select" } },
        },
        selected: {
          initial: "loading",
          on: {
            // a new selection starts the detail over: its checklist loads again
            SELECT: { guard: "canSelect", target: "selected", reenter: true, actions: "select" },
            RENAME: {
              guard: "canRename",
              actions: startOp("rename", (context, event) =>
                event.type === "RENAME" && context.selectedId !== null
                  ? { kind: "rename", id: context.selectedId, title: event.title.trim() }
                  : null,
              ),
            },
            ARCHIVE: {
              guard: "canArchive",
              target: "none",
              actions: [
                startOp("archive", context =>
                  context.selectedId !== null ? { kind: "archive", id: context.selectedId } : null,
                ),
                assign(({ context }) => ({
                  selectedId: null,
                  checklistError: null,
                  errors: { ...context.errors, rename: null, item: null },
                })),
              ],
            },
          },
          states: {
            loading: {
              invoke: {
                src: "loadChecklist",
                input: ({ context }) => context.selectedId!,
                onDone: {
                  target: "ready",
                  actions: assign({
                    base: ({ context, event }) => ({
                      ...context.base,
                      lists: { ...context.base.lists, [context.selectedId!]: event.output.map(fromItem) },
                    }),
                  }),
                },
                onError: {
                  target: "failed",
                  actions: assign({ checklistError: ({ event }) => errorMessage(event.error) }),
                },
              },
            },
            ready: {
              on: {
                TOGGLE: {
                  guard: "canToggle",
                  actions: startOp("item", (context, event) => {
                    if (event.type !== "TOGGLE" || context.selectedId === null) return null;
                    const list = shown(context.base, context.ops).lists[context.selectedId] ?? [];
                    const item = list.find(i => i.id === event.itemId);
                    return item
                      ? { kind: "toggle", cardId: context.selectedId, itemId: event.itemId, done: !item.done }
                      : null;
                  }),
                },
                ADD_ITEM: {
                  guard: "canAddItem",
                  actions: startOp("item", (context, event) =>
                    event.type === "ADD_ITEM" && context.selectedId !== null
                      ? { kind: "addItem", cardId: context.selectedId, text: event.text.trim() }
                      : null,
                  ),
                },
              },
            },
            failed: {},
          },
        },
      },
    },
  },
});
