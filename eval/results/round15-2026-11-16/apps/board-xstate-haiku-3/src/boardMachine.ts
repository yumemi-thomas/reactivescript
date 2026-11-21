import { assign, setup, spawnChild, stopChild } from "xstate";
import {
  addCard,
  addItem,
  archiveCard,
  fetchCards,
  fetchChecklist,
  moveCard,
  renameCard,
  toggleItem,
} from "./api";
import type { Card as ServerCard, Column, Item as ServerItem } from "./api";
import { requestLogic, type RequestEvent, type RequestInput } from "./request";

export type { Column };

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_LABEL: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

export type Dir = "left" | "right" | "up" | "down";
/** A card on the board. `id` is missing while its add is still in the air. */
export type Card = { key: string; id?: number; title: string; done: number; total: number };
export type Item = { key: string; id?: number; text: string; done: boolean };
export type Place = { column: Column; index: number };
export type Load = { status: "loading" } | { status: "loaded" } | { status: "failed"; message: string };
export type Checklist =
  | { status: "idle" }
  | { status: "loading"; cardKey: string; cardId: number }
  | { status: "loaded"; cardKey: string; cardId: number; items: Item[] }
  | { status: "failed"; cardKey: string; cardId: number; message: string };

/** The server call a request makes. */
export type Call =
  | { fn: "fetchCards"; column: Column }
  | { fn: "fetchChecklist"; cardId: number }
  | { fn: "moveCard"; cardId: number; to: Place }
  | { fn: "addCard"; title: string }
  | { fn: "renameCard"; cardId: number; title: string }
  | { fn: "archiveCard"; cardId: number }
  | { fn: "toggleItem"; cardId: number; itemId: number; done: boolean }
  | { fn: "addItem"; cardId: number; text: string };

/** What the machine must remember about a request in the air, to settle it when the answer comes. */
export type Pending =
  | { kind: "load"; column: Column }
  | { kind: "move"; key: string; from: Place }
  | { kind: "add"; key: string }
  | { kind: "rename"; key: string; previous: string }
  | { kind: "archive"; card: Card; place: Place }
  | { kind: "checklist"; cardKey: string }
  | { kind: "toggle"; cardKey: string; itemKey: string; previous: boolean }
  | { kind: "addItem"; cardKey: string; itemKey: string };

export type InFlight = { call: Call; meta: Pending };

export type BoardContext = {
  cards: Record<Column, Card[]>;
  loads: Record<Column, Load>;
  selected: string | null;
  checklist: Checklist;
  pending: Record<string, InFlight>;
  seq: number;
  errors: { move?: string; add?: string; rename?: string; item?: string; archive?: string };
};

export type BoardEvent =
  | { type: "RETRY"; column: Column }
  | { type: "MOVE"; key: string; dir: Dir }
  | { type: "ADD_CARD"; title: string }
  | { type: "SELECT"; key: string }
  | { type: "RENAME"; title: string }
  | { type: "ARCHIVE" }
  | { type: "TOGGLE_ITEM"; key: string }
  | { type: "ADD_ITEM"; text: string }
  | RequestEvent;

export type At = Place & { card: Card };

// ---- pure helpers -------------------------------------------------------

export function locate(cards: Record<Column, Card[]>, key: string): At | undefined {
  for (const column of COLUMNS) {
    const index = cards[column].findIndex((c) => c.key === key);
    if (index >= 0) return { column, index, card: cards[column][index] };
  }
  return undefined;
}

function take(cards: Record<Column, Card[]>, key: string): Record<Column, Card[]> {
  const at = locate(cards, key);
  if (!at) return cards;
  return { ...cards, [at.column]: cards[at.column].filter((c) => c.key !== key) };
}

function put(cards: Record<Column, Card[]>, card: Card, place: Place): Record<Column, Card[]> {
  const list = cards[place.column].filter((c) => c.key !== card.key);
  list.splice(Math.min(Math.max(place.index, 0), list.length), 0, card);
  return { ...cards, [place.column]: list };
}

function update(cards: Record<Column, Card[]>, key: string, change: (card: Card) => Card): Record<Column, Card[]> {
  const at = locate(cards, key);
  if (!at) return cards;
  return { ...cards, [at.column]: cards[at.column].map((c) => (c.key === key ? change(c) : c)) };
}

/** Where a move button in direction `dir` sends the card, or undefined when there is nowhere to go. */
export function destinationOf(cards: Record<Column, Card[]>, at: At, dir: Dir): Place | undefined {
  const col = COLUMNS.indexOf(at.column);
  switch (dir) {
    case "left":
      return col > 0 ? { column: COLUMNS[col - 1], index: cards[COLUMNS[col - 1]].length } : undefined;
    case "right":
      return col < COLUMNS.length - 1 ? { column: COLUMNS[col + 1], index: cards[COLUMNS[col + 1]].length } : undefined;
    case "up":
      return at.index > 0 ? { column: at.column, index: at.index - 1 } : undefined;
    case "down":
      return at.index < cards[at.column].length - 1 ? { column: at.column, index: at.index + 1 } : undefined;
  }
}

/** Whether a move from `from` to `to` may happen now: the target column is shown, and Doing is not full. */
export function allowedMove(ctx: BoardContext, from: Place, to: Place): boolean {
  if (ctx.loads[to.column].status !== "loaded") return false;
  return !(to.column === "doing" && from.column !== "doing" && ctx.cards.doing.length >= WIP_LIMIT);
}

function withCounts(cards: Record<Column, Card[]>, checklist: Checklist): Record<Column, Card[]> {
  if (checklist.status !== "loaded") return cards;
  const done = checklist.items.filter((i) => i.done).length;
  const total = checklist.items.length;
  return update(cards, checklist.cardKey, (c) => ({ ...c, done, total }));
}

/** Changes the items of the checklist for `cardKey`, when that checklist is loaded, and the card's counts with it. */
function changeItems(ctx: BoardContext, cardKey: string, change: (items: Item[]) => Item[]): Partial<BoardContext> {
  const cl = ctx.checklist;
  if (cl.status !== "loaded" || cl.cardKey !== cardKey) return {};
  const checklist: Checklist = { ...cl, items: change(cl.items) };
  return { checklist, cards: withCounts(ctx.cards, checklist) };
}

function withLoad(loads: Record<Column, Load>, column: Column, load: Load): Record<Column, Load> {
  return { ...loads, [column]: load };
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

const toCard = (c: ServerCard): Card => ({ key: `c${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total });
const toItem = (i: ServerItem): Item => ({ key: `i${i.id}`, id: i.id, text: i.text, done: i.done });

/** The server call, as a promise. */
function perform(call: Call): Promise<unknown> {
  switch (call.fn) {
    case "fetchCards":
      return fetchCards(call.column);
    case "fetchChecklist":
      return fetchChecklist(call.cardId);
    case "moveCard":
      return moveCard(call.cardId, call.to.column, call.to.index);
    case "addCard":
      return addCard("todo", call.title);
    case "renameCard":
      return renameCard(call.cardId, call.title);
    case "archiveCard":
      return archiveCard(call.cardId);
    case "toggleItem":
      return toggleItem(call.cardId, call.itemId, call.done);
    case "addItem":
      return addItem(call.cardId, call.text);
  }
}

/** A request the machine is about to start: its optimistic changes to the board, its call and what to do with the answer. */
type Plan = { next?: Partial<BoardContext>; call: Call; meta: Pending };

/** Records a planned request under the context's next counter value. The spawn that follows names it with `requestIdOf`. */
function launch(ctx: BoardContext, plan: Plan | undefined): Partial<BoardContext> {
  if (!plan) return {};
  const requestId = `r${ctx.seq}`;
  return {
    ...plan.next,
    seq: ctx.seq + 1,
    pending: { ...ctx.pending, [requestId]: { call: plan.call, meta: plan.meta } },
  };
}

/** The id of the request `launch` just recorded. Read after that assign, so it is the context's counter less one. */
const requestIdOf = (ctx: BoardContext) => `r${ctx.seq - 1}`;

function requestInput(ctx: BoardContext): RequestInput {
  const requestId = requestIdOf(ctx);
  const call = ctx.pending[requestId].call;
  return { requestId, run: () => perform(call) };
}

type Outcome = { ok: true; output: unknown } | { ok: false; message: string };
type Ev<T extends BoardEvent["type"]> = Extract<BoardEvent, { type: T }>;

/** Settles one answered request: what the server's answer does to the board, and forgets the request. */
function settle(ctx: BoardContext, requestId: string, outcome: Outcome): Partial<BoardContext> {
  const inFlight = ctx.pending[requestId];
  if (!inFlight) return {};
  const pending = withoutKey(ctx.pending, requestId);
  const meta = inFlight.meta;
  switch (meta.kind) {
    case "load": {
      const column = meta.column;
      if (ctx.loads[column].status !== "loading") return { pending };
      if (!outcome.ok) return { pending, loads: withLoad(ctx.loads, column, { status: "failed", message: outcome.message }) };
      return {
        pending,
        loads: withLoad(ctx.loads, column, { status: "loaded" }),
        cards: { ...ctx.cards, [column]: (outcome.output as ServerCard[]).map(toCard) },
      };
    }
    case "move": {
      if (outcome.ok) return { pending };
      // The server declined: the card goes back where it was.
      const at = locate(ctx.cards, meta.key);
      const cards = at ? put(take(ctx.cards, meta.key), at.card, meta.from) : ctx.cards;
      return { pending, cards, errors: { ...ctx.errors, move: `move error: ${outcome.message}` } };
    }
    case "add": {
      if (outcome.ok) {
        const id = (outcome.output as { id: number }).id;
        return { pending, cards: update(ctx.cards, meta.key, (c) => ({ ...c, id })) };
      }
      return { pending, cards: take(ctx.cards, meta.key), errors: { ...ctx.errors, add: `add error: ${outcome.message}` } };
    }
    case "rename": {
      if (outcome.ok) return { pending };
      const previous = meta.previous;
      return {
        pending,
        cards: update(ctx.cards, meta.key, (c) => ({ ...c, title: previous })),
        errors: { ...ctx.errors, rename: `rename error: ${outcome.message}` },
      };
    }
    case "archive": {
      if (outcome.ok) return { pending };
      return {
        pending,
        cards: put(ctx.cards, meta.card, meta.place),
        errors: { ...ctx.errors, archive: `archive error: ${outcome.message}` },
      };
    }
    case "checklist": {
      const cl = ctx.checklist;
      if (cl.status !== "loading" || cl.cardKey !== meta.cardKey) return { pending };
      if (!outcome.ok) {
        return { pending, checklist: { status: "failed", cardKey: cl.cardKey, cardId: cl.cardId, message: outcome.message } };
      }
      const checklist: Checklist = {
        status: "loaded",
        cardKey: cl.cardKey,
        cardId: cl.cardId,
        items: (outcome.output as ServerItem[]).map(toItem),
      };
      return { pending, checklist, cards: withCounts(ctx.cards, checklist) };
    }
    case "toggle": {
      if (outcome.ok) return { pending };
      const { itemKey, previous } = meta;
      return {
        pending,
        ...changeItems(ctx, meta.cardKey, (items) => items.map((i) => (i.key === itemKey ? { ...i, done: previous } : i))),
        errors: { ...ctx.errors, item: `item error: ${outcome.message}` },
      };
    }
    case "addItem": {
      const itemKey = meta.itemKey;
      if (outcome.ok) {
        const id = (outcome.output as ServerItem).id;
        return {
          pending,
          ...changeItems(ctx, meta.cardKey, (items) => items.map((i) => (i.key === itemKey ? { ...i, id } : i))),
        };
      }
      return {
        pending,
        ...changeItems(ctx, meta.cardKey, (items) => items.filter((i) => i.key !== itemKey)),
        errors: { ...ctx.errors, item: `item error: ${outcome.message}` },
      };
    }
  }
}

// What each user action does, as a plan. Each returns undefined when the action does not apply right now.

function planRetry(ctx: BoardContext, column: Column): Plan | undefined {
  if (ctx.loads[column].status !== "failed") return undefined;
  return {
    next: { loads: withLoad(ctx.loads, column, { status: "loading" }) },
    call: { fn: "fetchCards", column },
    meta: { kind: "load", column },
  };
}

function planMove(ctx: BoardContext, event: Ev<"MOVE">): Plan | undefined {
  const at = locate(ctx.cards, event.key);
  if (!at) return undefined;
  const cardId = at.card.id;
  if (cardId === undefined) return undefined;
  const from: Place = { column: at.column, index: at.index };
  const to = destinationOf(ctx.cards, at, event.dir);
  if (!to || !allowedMove(ctx, from, to)) return undefined;
  return {
    next: { cards: put(take(ctx.cards, at.card.key), at.card, to), errors: { ...ctx.errors, move: undefined } },
    call: { fn: "moveCard", cardId, to },
    meta: { kind: "move", key: at.card.key, from },
  };
}

function planAddCard(ctx: BoardContext, event: Ev<"ADD_CARD">): Plan | undefined {
  const title = event.title.trim();
  if (!title || ctx.loads.todo.status !== "loaded") return undefined;
  const key = `n${ctx.seq}`;
  return {
    next: {
      cards: { ...ctx.cards, todo: [...ctx.cards.todo, { key, title, done: 0, total: 0 }] },
      errors: { ...ctx.errors, add: undefined },
    },
    call: { fn: "addCard", title },
    meta: { kind: "add", key },
  };
}

function planSelect(ctx: BoardContext, event: Ev<"SELECT">): Plan | undefined {
  const at = locate(ctx.cards, event.key);
  if (!at) return undefined;
  const cardId = at.card.id;
  if (cardId === undefined) return undefined;
  const cardKey = event.key;
  return {
    next: {
      selected: cardKey,
      checklist: { status: "loading", cardKey, cardId },
      errors: { ...ctx.errors, rename: undefined, item: undefined },
    },
    call: { fn: "fetchChecklist", cardId },
    meta: { kind: "checklist", cardKey },
  };
}

function planRename(ctx: BoardContext, event: Ev<"RENAME">): Plan | undefined {
  const key = ctx.selected;
  const title = event.title.trim();
  if (key === null || !title) return undefined;
  const at = locate(ctx.cards, key);
  if (!at) return undefined;
  const cardId = at.card.id;
  if (cardId === undefined) return undefined;
  return {
    next: {
      cards: update(ctx.cards, key, (c) => ({ ...c, title })),
      errors: { ...ctx.errors, rename: undefined },
    },
    call: { fn: "renameCard", cardId, title },
    meta: { kind: "rename", key, previous: at.card.title },
  };
}

function planArchive(ctx: BoardContext): Plan | undefined {
  const key = ctx.selected;
  if (key === null) return undefined;
  const at = locate(ctx.cards, key);
  if (!at) return undefined;
  const cardId = at.card.id;
  if (cardId === undefined) return undefined;
  return {
    next: {
      cards: take(ctx.cards, key),
      selected: null,
      checklist: { status: "idle" },
      errors: { ...ctx.errors, archive: undefined },
    },
    call: { fn: "archiveCard", cardId },
    meta: { kind: "archive", card: at.card, place: { column: at.column, index: at.index } },
  };
}

function planToggle(ctx: BoardContext, event: Ev<"TOGGLE_ITEM">): Plan | undefined {
  const cl = ctx.checklist;
  if (cl.status !== "loaded") return undefined;
  const item = cl.items.find((i) => i.key === event.key);
  if (!item || item.id === undefined) return undefined;
  const itemId = item.id;
  const itemKey = item.key;
  const done = !item.done;
  return {
    next: {
      ...changeItems(ctx, cl.cardKey, (items) => items.map((i) => (i.key === itemKey ? { ...i, done } : i))),
      errors: { ...ctx.errors, item: undefined },
    },
    call: { fn: "toggleItem", cardId: cl.cardId, itemId, done },
    meta: { kind: "toggle", cardKey: cl.cardKey, itemKey, previous: item.done },
  };
}

function planAddItem(ctx: BoardContext, event: Ev<"ADD_ITEM">): Plan | undefined {
  const cl = ctx.checklist;
  const text = event.text.trim();
  if (cl.status !== "loaded" || !text) return undefined;
  const itemKey = `n${ctx.seq}`;
  return {
    next: {
      ...changeItems(ctx, cl.cardKey, (items) => [...items, { key: itemKey, text, done: false }]),
      errors: { ...ctx.errors, item: undefined },
    },
    call: { fn: "addItem", cardId: cl.cardId, text },
    meta: { kind: "addItem", cardKey: cl.cardKey, itemKey },
  };
}

const initialContext: BoardContext = {
  cards: { todo: [], doing: [], done: [] },
  loads: { todo: { status: "loading" }, doing: { status: "loading" }, done: { status: "loading" } },
  selected: null,
  checklist: { status: "idle" },
  pending: {},
  seq: 1,
  errors: {},
};

// ---- the machine --------------------------------------------------------

/** The board page: three columns loaded from the server, with optimistic moves, adds, renames, archives and checklist edits. */
export const boardMachine = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: { request: requestLogic },
}).createMachine({
  id: "board",
  context: initialContext,
  entry: COLUMNS.flatMap((column) => [
    assign(({ context }) => launch(context, { call: { fn: "fetchCards", column }, meta: { kind: "load", column } })),
    spawnChild("request", {
      id: ({ context }) => requestIdOf(context),
      input: ({ context }) => requestInput(context),
    }),
  ]),
  on: {
    RETRY: {
      guard: ({ context, event }) => planRetry(context, event.column) !== undefined,
      actions: [
        assign(({ context, event }) => launch(context, planRetry(context, event.column))),
        spawnChild("request", {
          id: ({ context }) => requestIdOf(context),
          input: ({ context }) => requestInput(context),
        }),
      ],
    },

    MOVE: {
      guard: ({ context, event }) => planMove(context, event) !== undefined,
      actions: [
        assign(({ context, event }) => launch(context, planMove(context, event))),
        spawnChild("request", {
          id: ({ context }) => requestIdOf(context),
          input: ({ context }) => requestInput(context),
        }),
      ],
    },

    ADD_CARD: {
      guard: ({ context, event }) => planAddCard(context, event) !== undefined,
      actions: [
        assign(({ context, event }) => launch(context, planAddCard(context, event))),
        spawnChild("request", {
          id: ({ context }) => requestIdOf(context),
          input: ({ context }) => requestInput(context),
        }),
      ],
    },

    SELECT: {
      guard: ({ context, event }) => planSelect(context, event) !== undefined,
      actions: [
        assign(({ context, event }) => launch(context, planSelect(context, event))),
        spawnChild("request", {
          id: ({ context }) => requestIdOf(context),
          input: ({ context }) => requestInput(context),
        }),
      ],
    },

    RENAME: {
      guard: ({ context, event }) => planRename(context, event) !== undefined,
      actions: [
        assign(({ context, event }) => launch(context, planRename(context, event))),
        spawnChild("request", {
          id: ({ context }) => requestIdOf(context),
          input: ({ context }) => requestInput(context),
        }),
      ],
    },

    ARCHIVE: {
      guard: ({ context }) => planArchive(context) !== undefined,
      actions: [
        assign(({ context }) => launch(context, planArchive(context))),
        spawnChild("request", {
          id: ({ context }) => requestIdOf(context),
          input: ({ context }) => requestInput(context),
        }),
      ],
    },

    TOGGLE_ITEM: {
      guard: ({ context, event }) => planToggle(context, event) !== undefined,
      actions: [
        assign(({ context, event }) => launch(context, planToggle(context, event))),
        spawnChild("request", {
          id: ({ context }) => requestIdOf(context),
          input: ({ context }) => requestInput(context),
        }),
      ],
    },

    ADD_ITEM: {
      guard: ({ context, event }) => planAddItem(context, event) !== undefined,
      actions: [
        assign(({ context, event }) => launch(context, planAddItem(context, event))),
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
