import { assign, enqueueActions, fromCallback, fromPromise, setup, stopChild } from "xstate";
import * as api from "./api.js";
import type { Card, Column, Item } from "./api";
import {
  type BoardData,
  type Dir,
  type Op,
  emptyData,
  errorMessage,
  findCard,
  fromServerCards,
  fromServerItems,
  moveOption,
  settle,
  view,
} from "./model";

type ScopedError = { cardId: number; message: string } | null;
type ColumnStatus = "loading" | "ready" | "failed";

export type BoardContext = {
  /** what the server has confirmed */
  base: BoardData;
  /** operations made on the board, oldest first; pending ones are shown on top of `base` */
  ops: Op[];
  nextOpId: number;
  colStatus: Record<Column, ColumnStatus>;
  colError: Record<Column, string | null>;
  selectedId: number | null;
  checklistError: string | null;
  newCard: string;
  titleInput: string;
  itemInput: string;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: ScopedError;
  itemError: ScopedError;
};

type OpEvent =
  | { type: "op.done"; opId: number; result: unknown }
  | { type: "op.failed"; opId: number; message: string };

export type BoardEvent =
  | { type: "retry"; column: Column }
  | { type: "move"; cardId: number; dir: Dir }
  | { type: "newCard.change"; value: string }
  | { type: "addCard" }
  | { type: "select"; cardId: number }
  | { type: "title.change"; value: string }
  | { type: "rename" }
  | { type: "archive" }
  | { type: "toggle"; itemId: number }
  | { type: "item.change"; value: string }
  | { type: "addItem" }
  | { type: "checklist.retry" }
  | OpEvent;

type OpDraft = Op extends infer O ? (O extends Op ? Omit<O, "opId" | "confirmed"> : never) : never;

function send(op: Op): Promise<unknown> {
  switch (op.kind) {
    case "move":
      return api.moveCard(op.cardId, op.column, op.index);
    case "rename":
      return api.renameCard(op.cardId, op.title);
    case "add":
      return api.addCard(op.column, op.title);
    case "archive":
      return api.archiveCard(op.cardId);
    case "toggle":
      return api.toggleItem(op.cardId, op.itemId, op.done);
    case "addItem":
      return api.addItem(op.cardId, op.text);
  }
}

/** Sends one operation to the server and reports back how it went. Stopping it drops a late answer. */
const request = fromCallback<{ type: "noop" }, { op: Op }, OpEvent>(({ input, sendBack }) => {
  let live = true;
  send(input.op).then(
    result => {
      if (live) sendBack({ type: "op.done", opId: input.op.opId, result });
    },
    (error: unknown) => {
      if (live) sendBack({ type: "op.failed", opId: input.op.opId, message: errorMessage(error) });
    },
  );
  return () => {
    live = false;
  };
});

const fetchCards = fromPromise<Card[], { column: Column }>(({ input }) => api.fetchCards(input.column));
const fetchChecklist = fromPromise<Item[], { cardId: number }>(({ input }) => api.fetchChecklist(input.cardId));

export const shown = (context: BoardContext): BoardData => view(context.base, context.ops);

export const columnsReady = (context: BoardContext): Record<Column, boolean> => ({
  todo: context.colStatus.todo === "ready",
  doing: context.colStatus.doing === "ready",
  done: context.colStatus.done === "ready",
});

function confirm(op: Op, result: unknown): Op {
  const r = (result ?? {}) as { id?: unknown; title?: unknown; text?: unknown };
  switch (op.kind) {
    case "add":
      return {
        ...op,
        confirmed: true,
        cardId: typeof r.id === "number" ? r.id : null,
        title: typeof r.title === "string" ? r.title : op.title,
      };
    case "rename":
      return { ...op, confirmed: true, title: typeof r.title === "string" ? r.title : op.title };
    case "addItem":
      return {
        ...op,
        confirmed: true,
        itemId: typeof r.id === "number" ? r.id : null,
        text: typeof r.text === "string" ? r.text : op.text,
      };
    default:
      return { ...op, confirmed: true };
  }
}

const columnRegion = (column: Column) => ({
  initial: "loading" as const,
  states: {
    loading: {
      entry: { type: "columnLoading" as const, params: { column } },
      invoke: {
        src: "fetchCards" as const,
        input: { column },
        onDone: { target: "ready" as const, actions: { type: "columnLoaded" as const, params: { column } } },
        onError: { target: "failed" as const, actions: { type: "columnFailed" as const, params: { column } } },
      },
    },
    ready: {},
    failed: {
      on: {
        retry: { guard: { type: "isColumn" as const, params: { column } }, target: "loading" as const },
      },
    },
  },
});

export const boardMachine = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: { fetchCards, fetchChecklist, request },
  guards: {
    isColumn: ({ event }, params: { column: Column }) => event.type === "retry" && event.column === params.column,
    canSelect: ({ context, event }) =>
      event.type === "select" && event.cardId !== context.selectedId && findCard(shown(context), event.cardId) !== null,
    hasSelection: ({ context }) => context.selectedId !== null && findCard(shown(context), context.selectedId) !== null,
  },
  actions: {
    columnLoading: assign(({ context }, params: { column: Column }) => ({
      colStatus: { ...context.colStatus, [params.column]: "loading" },
      colError: { ...context.colError, [params.column]: null },
    })),
    columnLoaded: assign(({ context, event }, params: { column: Column }) => {
      const cards = (event as unknown as { output: Card[] }).output;
      return {
        base: { ...context.base, cols: { ...context.base.cols, [params.column]: fromServerCards(cards) } },
        colStatus: { ...context.colStatus, [params.column]: "ready" },
      };
    }),
    columnFailed: assign(({ context, event }, params: { column: Column }) => ({
      colStatus: { ...context.colStatus, [params.column]: "failed" },
      colError: { ...context.colError, [params.column]: errorMessage((event as unknown as { error: unknown }).error) },
    })),
    select: assign(({ event }) => ({
      selectedId: event.type === "select" ? event.cardId : null,
      titleInput: "",
      itemInput: "",
      renameError: null,
      itemError: null,
      checklistError: null,
    })),
    deselect: assign({
      selectedId: null,
      titleInput: "",
      itemInput: "",
      renameError: null,
      itemError: null,
      checklistError: null,
    }),
    checklistLoaded: assign(({ context, event }) => {
      const id = context.selectedId;
      if (id === null) return {};
      const items = (event as unknown as { output: Item[] }).output;
      return { base: { ...context.base, items: { ...context.base.items, [id]: fromServerItems(items) } } };
    }),
    checklistFailed: assign(({ event }) => ({
      checklistError: errorMessage((event as unknown as { error: unknown }).error),
    })),
    /** Starts a server operation: shows it at once and sends it. */
    start: enqueueActions(({ context, event, enqueue }) => {
      const s = shown(context);
      let draft: OpDraft | null = null;
      const clear: Partial<BoardContext> = {};
      switch (event.type) {
        case "move": {
          const at = findCard(s, event.cardId);
          if (!at) return;
          const opt = moveOption(s, columnsReady(context), at.column, at.index, event.dir);
          if (opt.kind !== "ok") return;
          draft = { kind: "move", cardId: event.cardId, column: opt.column, index: opt.index };
          clear.moveError = null;
          break;
        }
        case "addCard": {
          const title = context.newCard.trim();
          if (!title) return;
          draft = { kind: "add", column: "todo", title, cardId: null };
          clear.addError = null;
          clear.newCard = "";
          break;
        }
        case "rename": {
          const title = context.titleInput.trim();
          const id = context.selectedId;
          if (!title || id === null || !findCard(s, id)) return;
          draft = { kind: "rename", cardId: id, title };
          clear.renameError = null;
          break;
        }
        case "archive": {
          const id = context.selectedId;
          if (id === null || !findCard(s, id)) return;
          draft = { kind: "archive", cardId: id };
          clear.archiveError = null;
          break;
        }
        case "toggle": {
          const id = context.selectedId;
          const item = id === null ? undefined : s.items[id]?.find(i => !i.pending && i.id === event.itemId);
          if (id === null || !item) return;
          draft = { kind: "toggle", cardId: id, itemId: item.id, done: !item.done };
          clear.itemError = null;
          break;
        }
        case "addItem": {
          const text = context.itemInput.trim();
          const id = context.selectedId;
          if (!text || id === null || !findCard(s, id)) return;
          draft = { kind: "addItem", cardId: id, text, itemId: null };
          clear.itemError = null;
          clear.itemInput = "";
          break;
        }
        default:
          return;
      }
      const op = { ...draft, opId: context.nextOpId, confirmed: false } as Op;
      enqueue.assign({ ...clear, ops: [...context.ops, op], nextOpId: context.nextOpId + 1 });
      enqueue.spawnChild("request", { id: `op-${op.opId}`, input: { op } });
    }),
    /** The server answered an operation: keep it, or take it back and say why. */
    finish: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== "op.done" && event.type !== "op.failed") return;
      enqueue(stopChild(`op-${event.opId}`));
      const op = context.ops.find(o => o.opId === event.opId);
      if (!op) return;
      if (event.type === "op.done") {
        const ops = context.ops.map(o => (o.opId === op.opId ? confirm(o, event.result) : o));
        enqueue.assign(settle(context.base, ops));
        return;
      }
      const errors: Partial<BoardContext> = {};
      const message = event.message;
      switch (op.kind) {
        case "move":
          errors.moveError = message;
          break;
        case "add":
          errors.addError = message;
          break;
        case "archive":
          errors.archiveError = message;
          break;
        case "rename":
          errors.renameError = { cardId: op.cardId, message };
          break;
        case "toggle":
        case "addItem":
          errors.itemError = { cardId: op.cardId, message };
          break;
      }
      enqueue.assign({ ...errors, ...settle(context.base, context.ops.filter(o => o.opId !== op.opId)) });
    }),
  },
}).createMachine({
  id: "board",
  type: "parallel",
  context: {
    base: emptyData(),
    ops: [],
    nextOpId: 1,
    colStatus: { todo: "loading", doing: "loading", done: "loading" },
    colError: { todo: null, doing: null, done: null },
    selectedId: null,
    checklistError: null,
    newCard: "",
    titleInput: "",
    itemInput: "",
    moveError: null,
    addError: null,
    archiveError: null,
    renameError: null,
    itemError: null,
  },
  on: {
    move: { actions: "start" },
    addCard: { actions: "start" },
    rename: { actions: "start" },
    toggle: { actions: "start" },
    addItem: { actions: "start" },
    "op.done": { actions: "finish" },
    "op.failed": { actions: "finish" },
    "newCard.change": { actions: assign({ newCard: ({ event }) => event.value }) },
    "title.change": { actions: assign({ titleInput: ({ event }) => event.value }) },
    "item.change": { actions: assign({ itemInput: ({ event }) => event.value }) },
  },
  states: {
    todo: columnRegion("todo"),
    doing: columnRegion("doing"),
    done: columnRegion("done"),
    detail: {
      initial: "none",
      on: {
        select: { guard: "canSelect", target: ".loading", actions: "select" },
        archive: { guard: "hasSelection", target: ".none", actions: ["start", "deselect"] },
      },
      states: {
        none: {},
        loading: {
          invoke: {
            src: "fetchChecklist",
            input: ({ context }) => ({ cardId: context.selectedId ?? -1 }),
            onDone: { target: "ready", actions: "checklistLoaded" },
            onError: { target: "failed", actions: "checklistFailed" },
          },
        },
        ready: {},
        failed: {
          on: { "checklist.retry": { target: "loading", actions: assign({ checklistError: null }) } },
        },
      },
    },
  },
});
