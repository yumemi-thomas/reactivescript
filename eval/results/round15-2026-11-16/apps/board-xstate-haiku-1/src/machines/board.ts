import { assign, setup } from "xstate";
import {
  addCard,
  addItem,
  archiveCard,
  fetchCards,
  fetchChecklist,
  moveCard,
  renameCard,
  toggleItem,
  type Card,
  type Column,
  type Item,
} from "../api.js";
import { requestMachine, type RequestResult, type Settled } from "./request";

export type { Column };
export const COLUMNS: Column[] = ["todo", "doing", "done"];
export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const DIRS = ["left", "right", "up", "down"] as const;
export type Dir = (typeof DIRS)[number];
export const WIP_LIMIT = 3;

export type Position = { column: Column; index: number };

/** A card on the board. `id` is null while its add is still with the server. */
export type BoardCard = {
  key: string;
  id: number | null;
  title: string;
  done: number;
  total: number;
  column: Column;
};

export type ChecklistItem = { key: string; id: number | null; text: string; done: boolean };

export type Load = { status: "loading" } | { status: "loaded" } | { status: "failed"; message: string };

export type Checklist = {
  cardId: number | null;
  requestId: string | null;
  status: "loading" | "loaded" | "failed";
  items: ChecklistItem[];
  message: string;
};

type Cols = Record<Column, BoardCard[]>;

/** What a request in the air will do when it settles, so a failure can be undone. */
type Pending =
  | { kind: "load"; column: Column }
  | { kind: "move"; cardId: number; from: Position }
  | { kind: "add"; key: string }
  | { kind: "rename"; cardId: number; previous: string }
  | { kind: "archive"; card: BoardCard; from: Position }
  | { kind: "checklist" }
  | { kind: "toggle"; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; cardId: number; key: string };

export type BoardContext = {
  loads: Record<Column, Load>;
  cols: Cols;
  selectedId: number | null;
  /** counts selections, so the detail's inputs restart for each one */
  selection: number;
  checklist: Checklist;
  errors: {
    move: string | null;
    add: string | null;
    archive: string | null;
    rename: string | null;
    item: string | null;
  };
  requests: Record<string, Pending>;
  nextRequest: number;
};

export type BoardEvent =
  | { type: "RETRY"; column: Column }
  | { type: "MOVE"; cardId: number; dir: Dir }
  | { type: "ADD"; title: string }
  | { type: "SELECT"; cardId: number }
  | { type: "RENAME"; title: string }
  | { type: "ARCHIVE" }
  | { type: "TOGGLE_ITEM"; itemId: number }
  | { type: "ADD_ITEM"; text: string }
  | Settled;

const EMPTY_CHECKLIST: Checklist = {
  cardId: null,
  requestId: null,
  status: "loading",
  items: [],
  message: "",
};

const initialContext: BoardContext = {
  loads: {
    todo: { status: "loading" },
    doing: { status: "loading" },
    done: { status: "loading" },
  },
  cols: { todo: [], doing: [], done: [] },
  selectedId: null,
  selection: 0,
  checklist: EMPTY_CHECKLIST,
  errors: { move: null, add: null, archive: null, rename: null, item: null },
  requests: {},
  nextRequest: 0,
};

// ---------- pure helpers on the board ----------

function nextId(ctx: BoardContext): string {
  return `r${ctx.nextRequest}`;
}

function track(ctx: BoardContext, id: string, pending: Pending): BoardContext {
  return { ...ctx, nextRequest: ctx.nextRequest + 1, requests: { ...ctx.requests, [id]: pending } };
}

function setIn<T>(record: Record<Column, T>, column: Column, value: T): Record<Column, T> {
  return { ...record, [column]: value };
}

function eachColumn(cols: Cols, f: (cards: BoardCard[]) => BoardCard[]): Cols {
  return { todo: f(cols.todo), doing: f(cols.doing), done: f(cols.done) };
}

function updateCards(
  cols: Cols,
  match: (card: BoardCard) => boolean,
  update: (card: BoardCard) => BoardCard,
): Cols {
  return eachColumn(cols, (cards) => cards.map((card) => (match(card) ? update(card) : card)));
}

function bump(cols: Cols, cardId: number, doneDelta: number, totalDelta: number): Cols {
  return updateCards(cols, (card) => card.id === cardId, (card) => ({
    ...card,
    done: card.done + doneDelta,
    total: card.total + totalDelta,
  }));
}

export function locate(cols: Cols, cardId: number): Position | undefined {
  for (const column of COLUMNS) {
    const index = cols[column].findIndex((card) => card.id === cardId);
    if (index !== -1) return { column, index };
  }
  return undefined;
}

export function findCard(cols: Cols, cardId: number): BoardCard | undefined {
  return COLUMNS.flatMap((column) => cols[column]).find((card) => card.id === cardId);
}

function lift(cols: Cols, at: Position): Cols {
  return { ...cols, [at.column]: cols[at.column].filter((_, i) => i !== at.index) };
}

function place(cols: Cols, card: BoardCard, at: Position): Cols {
  const cards = [...cols[at.column]];
  cards.splice(Math.min(Math.max(at.index, 0), cards.length), 0, card);
  return { ...cols, [at.column]: cards };
}

/** Puts a card back where it came from, if it is still on the board. */
function returnCard(cols: Cols, cardId: number, to: Position): Cols {
  const at = locate(cols, cardId);
  if (!at) return cols;
  return place(lift(cols, at), cols[at.column][at.index], to);
}

function toCards(column: Column, cards: Card[]): BoardCard[] {
  return cards.map((card) => ({
    key: `c${card.id}`,
    id: card.id,
    title: card.title,
    done: card.done,
    total: card.total,
    column,
  }));
}

function toItem(item: Item): ChecklistItem {
  return { key: `i${item.id}`, id: item.id, text: item.text, done: item.done };
}

function checklistReady(ctx: BoardContext): boolean {
  return ctx.selectedId !== null && ctx.checklist.cardId === ctx.selectedId && ctx.checklist.status === "loaded";
}

/** Where a move would take the card, or undefined when there is nowhere to go. */
export function planMove(ctx: BoardContext, cardId: number, dir: Dir): { from: Position; to: Position } | undefined {
  const from = locate(ctx.cols, cardId);
  if (!from) return undefined;
  if (dir === "left" || dir === "right") {
    const column: Column | undefined = COLUMNS[COLUMNS.indexOf(from.column) + (dir === "left" ? -1 : 1)];
    if (column === undefined) return undefined;
    return { from, to: { column, index: ctx.cols[column].length } };
  }
  const index = from.index + (dir === "up" ? -1 : 1);
  if (index < 0 || index >= ctx.cols[from.column].length) return undefined;
  return { from, to: { column: from.column, index } };
}

function canMove(ctx: BoardContext, plan: { from: Position; to: Position }): boolean {
  if (ctx.loads[plan.to.column].status !== "loaded") return false;
  const intoDoing = plan.to.column === "doing" && plan.from.column !== "doing";
  return !(intoDoing && ctx.cols.doing.length >= WIP_LIMIT);
}

export type MoveState = "hidden" | "enabled" | "disabled";

/** Whether a move button is absent, usable, or shown but blocked. */
export function moveState(ctx: BoardContext, cardId: number, dir: Dir): MoveState {
  const plan = planMove(ctx, cardId, dir);
  if (!plan) return "hidden";
  return canMove(ctx, plan) ? "enabled" : "disabled";
}

/** Applies a server answer to the request it belongs to. */
function settle(ctx: BoardContext, id: string, result: RequestResult): BoardContext {
  const pending = ctx.requests[id];
  const requests = { ...ctx.requests };
  delete requests[id];
  const next: BoardContext = { ...ctx, requests };
  if (!pending) return next;

  switch (pending.kind) {
    case "load": {
      if (result.ok) {
        const loaded: Load = { status: "loaded" };
        return {
          ...next,
          cols: setIn(next.cols, pending.column, toCards(pending.column, result.value as Card[])),
          loads: setIn<Load>(next.loads, pending.column, loaded),
        };
      }
      const failed: Load = { status: "failed", message: result.message };
      return { ...next, loads: setIn<Load>(next.loads, pending.column, failed) };
    }
    case "move": {
      if (result.ok) return next;
      return {
        ...next,
        cols: returnCard(next.cols, pending.cardId, pending.from),
        errors: { ...next.errors, move: `move error: ${result.message}` },
      };
    }
    case "add": {
      if (result.ok) {
        const created = result.value as { id: number; title: string };
        return {
          ...next,
          cols: updateCards(
            next.cols,
            (card) => card.key === pending.key,
            (card) => ({ ...card, key: `c${created.id}`, id: created.id, title: created.title }),
          ),
        };
      }
      return {
        ...next,
        cols: eachColumn(next.cols, (cards) => cards.filter((card) => card.key !== pending.key)),
        errors: { ...next.errors, add: `add error: ${result.message}` },
      };
    }
    case "rename": {
      if (result.ok) return next;
      return {
        ...next,
        cols: updateCards(
          next.cols,
          (card) => card.id === pending.cardId,
          (card) => ({ ...card, title: pending.previous }),
        ),
        errors: { ...next.errors, rename: `rename error: ${result.message}` },
      };
    }
    case "archive": {
      if (result.ok) return next;
      return {
        ...next,
        cols: place(next.cols, pending.card, pending.from),
        errors: { ...next.errors, archive: `archive error: ${result.message}` },
      };
    }
    case "checklist": {
      if (next.checklist.requestId !== id) return next;
      if (result.ok) {
        return {
          ...next,
          checklist: { ...next.checklist, status: "loaded", items: (result.value as Item[]).map(toItem) },
        };
      }
      return { ...next, checklist: { ...next.checklist, status: "failed", message: result.message } };
    }
    case "toggle": {
      if (result.ok) return next;
      const undone = !pending.done;
      return {
        ...next,
        cols: bump(next.cols, pending.cardId, pending.done ? -1 : 1, 0),
        checklist:
          next.checklist.cardId === pending.cardId
            ? {
                ...next.checklist,
                items: next.checklist.items.map((item) =>
                  item.id === pending.itemId ? { ...item, done: undone } : item,
                ),
              }
            : next.checklist,
        errors: { ...next.errors, item: `item error: ${result.message}` },
      };
    }
    case "addItem": {
      if (result.ok) {
        if (next.checklist.cardId !== pending.cardId) return next;
        const created = result.value as Item;
        return {
          ...next,
          checklist: {
            ...next.checklist,
            items: next.checklist.items.map((item) =>
              item.key === pending.key ? toItem(created) : item,
            ),
          },
        };
      }
      return {
        ...next,
        cols: bump(next.cols, pending.cardId, 0, -1),
        checklist:
          next.checklist.cardId === pending.cardId
            ? { ...next.checklist, items: next.checklist.items.filter((item) => item.key !== pending.key) }
            : next.checklist,
        errors: { ...next.errors, item: `item error: ${result.message}` },
      };
    }
  }
}

export const boardMachine = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: { request: requestMachine },
}).createMachine({
  id: "board",
  context: initialContext,

  // Opening the board loads all three columns.
  entry: assign(({ context, spawn }) => {
    let next = context;
    for (const column of COLUMNS) {
      const id = nextId(next);
      spawn("request", { id, input: { requestId: id, run: () => fetchCards(column) } });
      next = track(next, id, { kind: "load", column });
    }
    return next;
  }),

  on: {
    settled: {
      actions: assign(({ context, event }) => settle(context, event.requestId, event.result)),
    },

    RETRY: {
      guard: ({ context, event }) => context.loads[event.column].status === "failed",
      actions: assign(({ context, event, spawn }) => {
        const column = event.column;
        const id = nextId(context);
        spawn("request", { id, input: { requestId: id, run: () => fetchCards(column) } });
        const next = track(context, id, { kind: "load", column });
        const loading: Load = { status: "loading" };
        return { ...next, loads: setIn<Load>(next.loads, column, loading) };
      }),
    },

    MOVE: {
      guard: ({ context, event }) => {
        const plan = planMove(context, event.cardId, event.dir);
        return plan !== undefined && canMove(context, plan);
      },
      actions: assign(({ context, event, spawn }) => {
        const plan = planMove(context, event.cardId, event.dir);
        if (!plan) return {};
        const { from, to } = plan;
        const card = context.cols[from.column][from.index];
        const id = nextId(context);
        spawn("request", {
          id,
          input: { requestId: id, run: () => moveCard(event.cardId, to.column, to.index) },
        });
        const next = track(context, id, { kind: "move", cardId: event.cardId, from });
        return {
          ...next,
          cols: place(lift(next.cols, from), card, to),
          errors: { ...next.errors, move: null },
        };
      }),
    },

    ADD: {
      guard: ({ context, event }) => context.loads.todo.status === "loaded" && event.title.trim() !== "",
      actions: assign(({ context, event, spawn }) => {
        const title = event.title.trim();
        const id = nextId(context);
        spawn("request", { id, input: { requestId: id, run: () => addCard("todo", title) } });
        const next = track(context, id, { kind: "add", key: id });
        const card: BoardCard = { key: id, id: null, title, done: 0, total: 0, column: "todo" };
        return {
          ...next,
          cols: { ...next.cols, todo: [...next.cols.todo, card] },
          errors: { ...next.errors, add: null },
        };
      }),
    },

    SELECT: {
      guard: ({ context, event }) => locate(context.cols, event.cardId) !== undefined,
      actions: assign(({ context, event, spawn }) => {
        const cardId = event.cardId;
        const id = nextId(context);
        spawn("request", { id, input: { requestId: id, run: () => fetchChecklist(cardId) } });
        const next = track(context, id, { kind: "checklist" });
        const checklist: Checklist = { cardId, requestId: id, status: "loading", items: [], message: "" };
        return {
          ...next,
          selectedId: cardId,
          selection: next.selection + 1,
          checklist,
          errors: { ...next.errors, rename: null, item: null },
        };
      }),
    },

    RENAME: {
      guard: ({ context, event }) =>
        context.selectedId !== null &&
        locate(context.cols, context.selectedId) !== undefined &&
        event.title.trim() !== "",
      actions: assign(({ context, event, spawn }) => {
        const cardId = context.selectedId;
        if (cardId === null) return {};
        const card = findCard(context.cols, cardId);
        if (!card) return {};
        const title = event.title.trim();
        const id = nextId(context);
        spawn("request", { id, input: { requestId: id, run: () => renameCard(cardId, title) } });
        const next = track(context, id, { kind: "rename", cardId, previous: card.title });
        return {
          ...next,
          cols: updateCards(next.cols, (c) => c.id === cardId, (c) => ({ ...c, title })),
          errors: { ...next.errors, rename: null },
        };
      }),
    },

    ARCHIVE: {
      guard: ({ context }) => context.selectedId !== null && locate(context.cols, context.selectedId) !== undefined,
      actions: assign(({ context, spawn }) => {
        const cardId = context.selectedId;
        if (cardId === null) return {};
        const from = locate(context.cols, cardId);
        if (!from) return {};
        const card = context.cols[from.column][from.index];
        const id = nextId(context);
        spawn("request", { id, input: { requestId: id, run: () => archiveCard(cardId) } });
        const next = track(context, id, { kind: "archive", card, from });
        return {
          ...next,
          cols: lift(next.cols, from),
          selectedId: null,
          checklist: EMPTY_CHECKLIST,
          errors: { ...next.errors, archive: null, rename: null, item: null },
        };
      }),
    },

    TOGGLE_ITEM: {
      guard: ({ context, event }) =>
        checklistReady(context) && context.checklist.items.some((item) => item.id === event.itemId),
      actions: assign(({ context, event, spawn }) => {
        const cardId = context.selectedId;
        const item = context.checklist.items.find((i) => i.id === event.itemId);
        if (cardId === null || !item) return {};
        const itemId = event.itemId;
        const done = !item.done;
        const id = nextId(context);
        spawn("request", {
          id,
          input: { requestId: id, run: () => toggleItem(cardId, itemId, done) },
        });
        const next = track(context, id, { kind: "toggle", cardId, itemId, done });
        return {
          ...next,
          checklist: {
            ...next.checklist,
            items: next.checklist.items.map((i) => (i.id === itemId ? { ...i, done } : i)),
          },
          cols: bump(next.cols, cardId, done ? 1 : -1, 0),
          errors: { ...next.errors, item: null },
        };
      }),
    },

    ADD_ITEM: {
      guard: ({ context, event }) => checklistReady(context) && event.text.trim() !== "",
      actions: assign(({ context, event, spawn }) => {
        const cardId = context.selectedId;
        if (cardId === null) return {};
        const text = event.text.trim();
        const id = nextId(context);
        spawn("request", { id, input: { requestId: id, run: () => addItem(cardId, text) } });
        const next = track(context, id, { kind: "addItem", cardId, key: id });
        const pendingItem: ChecklistItem = { key: id, id: null, text, done: false };
        return {
          ...next,
          checklist: { ...next.checklist, items: [...next.checklist.items, pendingItem] },
          cols: bump(next.cols, cardId, 0, 1),
          errors: { ...next.errors, item: null },
        };
      }),
    },
  },
});
