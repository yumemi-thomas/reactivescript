import { assign, fromPromise, setup } from "xstate";
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
import type { Card as ApiCard, Column, Item as ApiItem } from "./api";
import { errorMessage, requestMachine } from "./request";
import type { RequestInput } from "./request";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAME: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;
export type Dir = "left" | "right" | "up" | "down";
export const DIRS: readonly Dir[] = ["left", "right", "up", "down"];

/** A card on the board. `id` is null while its add is still in the air. */
export type CardRow = { key: string; id: number | null; title: string; done: number; total: number };
export type ItemRow = { key: string; id: number | null; text: string; done: boolean };
export type LoadStatus = "loading" | "ready" | "failed";
export type ChecklistStatus = "idle" | "loading" | "ready" | "failed";
export type Columns = Record<Column, CardRow[]>;
export type Location = { column: Column; index: number };

/** An optimistic change waiting for the server, with what is needed to roll it back. */
export type Pending =
  | { kind: "move"; key: string; from: Location }
  | { kind: "add"; key: string }
  | { kind: "rename"; id: number; previous: string }
  | { kind: "archive"; card: CardRow; from: Location }
  | { kind: "toggle"; cardId: number; key: string; done: boolean }
  | { kind: "addItem"; cardId: number; key: string };

export type BoardContext = {
  columns: Columns;
  status: Record<Column, LoadStatus>;
  loadErrors: Record<Column, string | null>;
  selectedId: number | null;
  checklist: ChecklistStatus;
  items: ItemRow[];
  checklistError: string | null;
  drafts: { newCard: string; title: string; item: string };
  errors: { move: string | null; add: string | null; archive: string | null; rename: string | null; item: string | null };
  pending: Record<string, Pending>;
  seq: number;
};

export type BoardEvent =
  | { type: "retry"; column: Column }
  | { type: "select"; id: number }
  | { type: "archive" }
  | { type: "move"; key: string; dir: Dir }
  | { type: "draft"; field: "newCard" | "title" | "item"; text: string }
  | { type: "add" }
  | { type: "rename" }
  | { type: "addItem" }
  | { type: "toggleItem"; key: string }
  | { type: "opSucceeded"; opId: string; output: unknown }
  | { type: "opFailed"; opId: string; error: string };

const cardKey = (id: number) => `c${id}`;
const itemKey = (id: number) => `i${id}`;

function toCardRow(card: ApiCard): CardRow {
  return { key: cardKey(card.id), id: card.id, title: card.title, done: card.done, total: card.total };
}

function toItemRow(item: ApiItem): ItemRow {
  return { key: itemKey(item.id), id: item.id, text: item.text, done: item.done };
}

/** Where the card matching `match` is on the board, with the card itself. */
export function locate(columns: Columns, match: (card: CardRow) => boolean): (Location & { card: CardRow }) | undefined {
  for (const column of COLUMNS) {
    const index = columns[column].findIndex(match);
    if (index !== -1) return { column, index, card: columns[column][index] };
  }
  return undefined;
}

export function selectedLocation(context: BoardContext) {
  return context.selectedId === null ? undefined : locate(context.columns, (c) => c.id === context.selectedId);
}

function replaceCard(columns: Columns, match: (card: CardRow) => boolean, update: (card: CardRow) => CardRow): Columns {
  const hit = locate(columns, match);
  if (!hit) return columns;
  return { ...columns, [hit.column]: columns[hit.column].map((c, i) => (i === hit.index ? update(c) : c)) };
}

function removeKey(columns: Columns, key: string): Columns {
  return {
    todo: columns.todo.filter((c) => c.key !== key),
    doing: columns.doing.filter((c) => c.key !== key),
    done: columns.done.filter((c) => c.key !== key),
  };
}

/** Puts `card` into `at.column` at `at.index` (clamped to the column's length). */
function insertAt(columns: Columns, at: Location, card: CardRow): Columns {
  const list = columns[at.column];
  const index = Math.max(0, Math.min(at.index, list.length));
  return { ...columns, [at.column]: [...list.slice(0, index), card, ...list.slice(index)] };
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

export function isMoving(context: Pick<BoardContext, "pending">, key: string): boolean {
  return Object.values(context.pending).some((p) => p.kind === "move" && p.key === key);
}

export type MovePlan = { key: string; id: number; card: CardRow; from: Location; to: Location };

/**
 * The place a card goes for a move button, or null when that move is not allowed right now:
 * the card is still being added or moved, the neighbour is not on the server yet, the target
 * column is not loaded, or Doing is at its work-in-progress limit.
 */
export function planMove(context: BoardContext, key: string, dir: Dir): MovePlan | null {
  const hit = locate(context.columns, (c) => c.key === key);
  if (!hit || hit.card.id === null || isMoving(context, key)) return null;
  const ci = COLUMNS.indexOf(hit.column);
  const list = context.columns[hit.column];
  let to: Location;
  if (dir === "left" || dir === "right") {
    const target: Column | undefined = COLUMNS[ci + (dir === "left" ? -1 : 1)];
    if (target === undefined || context.status[target] !== "ready") return null;
    if (target === "doing" && context.columns.doing.length >= WIP_LIMIT) return null;
    to = { column: target, index: context.columns[target].length };
  } else {
    const index = hit.index + (dir === "up" ? -1 : 1);
    const neighbour: CardRow | undefined = list[index];
    if (neighbour === undefined || neighbour.id === null || isMoving(context, neighbour.key)) return null;
    to = { column: hit.column, index };
  }
  return { key, id: hit.card.id, card: hit.card, from: { column: hit.column, index: hit.index }, to };
}

/** What a card's move button shows: not there at all, there but disabled, or enabled. */
export function moveButton(context: BoardContext, key: string, dir: Dir): "hidden" | "disabled" | "enabled" {
  const hit = locate(context.columns, (c) => c.key === key);
  if (!hit || hit.card.id === null) return "hidden";
  const last = context.columns[hit.column].length - 1;
  const shown =
    dir === "left" ? hit.column !== "todo" :
    dir === "right" ? hit.column !== "done" :
    dir === "up" ? hit.index > 0 :
    hit.index < last;
  if (!shown) return "hidden";
  return planMove(context, key, dir) ? "enabled" : "disabled";
}

const request = (opId: string, run: () => Promise<unknown>): { id: string; input: RequestInput } => ({
  id: opId,
  input: { opId, run },
});

function settleOk(context: BoardContext, opId: string, output: unknown): Partial<BoardContext> {
  const op = context.pending[opId];
  const pending = without(context.pending, opId);
  if (!op) return {};
  switch (op.kind) {
    case "add": {
      const id = (output as ApiCard).id;
      return { pending, columns: replaceCard(context.columns, (c) => c.key === op.key, (c) => ({ ...c, id })) };
    }
    case "addItem": {
      const id = (output as ApiItem).id;
      const items = context.selectedId === op.cardId
        ? context.items.map((i) => (i.key === op.key ? { ...i, id } : i))
        : context.items;
      return { pending, items };
    }
    default:
      return { pending };
  }
}

function settleFailed(context: BoardContext, opId: string, error: string): Partial<BoardContext> {
  const op = context.pending[opId];
  const pending = without(context.pending, opId);
  if (!op) return {};
  const selected = context.selectedId;
  switch (op.kind) {
    case "move": {
      const card = locate(context.columns, (c) => c.key === op.key)?.card;
      const columns = card ? insertAt(removeKey(context.columns, op.key), op.from, card) : context.columns;
      return { pending, columns, errors: { ...context.errors, move: error } };
    }
    case "add":
      return {
        pending,
        columns: removeKey(context.columns, op.key),
        errors: { ...context.errors, add: error },
      };
    case "rename":
      return {
        pending,
        columns: replaceCard(context.columns, (c) => c.id === op.id, (c) => ({ ...c, title: op.previous })),
        errors: { ...context.errors, rename: selected === op.id ? error : context.errors.rename },
      };
    case "archive":
      return {
        pending,
        columns: insertAt(context.columns, op.from, op.card),
        errors: { ...context.errors, archive: error },
      };
    case "toggle": {
      const sameCard = selected === op.cardId;
      return {
        pending,
        columns: replaceCard(context.columns, (c) => c.id === op.cardId, (c) => ({ ...c, done: c.done + (op.done ? -1 : 1) })),
        items: sameCard ? context.items.map((i) => (i.key === op.key ? { ...i, done: !op.done } : i)) : context.items,
        errors: { ...context.errors, item: sameCard ? error : context.errors.item },
      };
    }
    case "addItem": {
      const sameCard = selected === op.cardId;
      return {
        pending,
        columns: replaceCard(context.columns, (c) => c.id === op.cardId, (c) => ({ ...c, total: c.total - 1 })),
        items: sameCard ? context.items.filter((i) => i.key !== op.key) : context.items,
        errors: { ...context.errors, item: sameCard ? error : context.errors.item },
      };
    }
  }
}

const boardSetup = setup({
  types: { context: {} as BoardContext, events: {} as BoardEvent },
  actors: {
    request: requestMachine,
    loadCards: fromPromise<ApiCard[], { column: Column }>(({ input }) => fetchCards(input.column)),
    loadChecklist: fromPromise<ApiItem[], { id: number }>(({ input }) => fetchChecklist(input.id)),
  },
});

/** One column: loads its cards, can be retried when it fails. */
function columnState(column: Column) {
  return boardSetup.createStateConfig({
    initial: "loading",
    states: {
      loading: {
        entry: assign(({ context }) => ({
          status: { ...context.status, [column]: "loading" as const },
          loadErrors: { ...context.loadErrors, [column]: null },
        })),
        invoke: {
          src: "loadCards",
          input: { column },
          onDone: {
            target: "ready",
            actions: assign(({ context, event }) => ({
              columns: { ...context.columns, [column]: event.output.map(toCardRow) },
            })),
          },
          onError: {
            target: "failed",
            actions: assign(({ context, event }) => ({
              loadErrors: { ...context.loadErrors, [column]: errorMessage(event.error) },
            })),
          },
        },
      },
      ready: {
        entry: assign(({ context }) => ({ status: { ...context.status, [column]: "ready" as const } })),
      },
      failed: {
        entry: assign(({ context }) => ({ status: { ...context.status, [column]: "failed" as const } })),
        on: {
          retry: { guard: ({ event }) => event.column === column, target: "loading" },
        },
      },
    },
  });
}

/**
 * The board page. Every change shows at once and is sent to the server as a child request;
 * a declined request reports back as opFailed and its change is rolled back.
 */
export const boardMachine = boardSetup.createMachine({
  id: "board",
  type: "parallel",
  context: {
    columns: { todo: [], doing: [], done: [] },
    status: { todo: "loading", doing: "loading", done: "loading" },
    loadErrors: { todo: null, doing: null, done: null },
    selectedId: null,
    checklist: "idle",
    items: [],
    checklistError: null,
    drafts: { newCard: "", title: "", item: "" },
    errors: { move: null, add: null, archive: null, rename: null, item: null },
    pending: {},
    seq: 1,
  },
  on: {
    draft: {
      actions: assign(({ context, event }) => ({ drafts: { ...context.drafts, [event.field]: event.text } })),
    },
    move: {
      guard: ({ context, event }) => planMove(context, event.key, event.dir) !== null,
      actions: assign(({ context, event, spawn }) => {
        const plan = planMove(context, event.key, event.dir);
        if (!plan) return {};
        const opId = `op${context.seq}`;
        spawn("request", request(opId, () => moveCard(plan.id, plan.to.column, plan.to.index)));
        return {
          columns: insertAt(removeKey(context.columns, plan.key), plan.to, plan.card),
          errors: { ...context.errors, move: null },
          pending: { ...context.pending, [opId]: { kind: "move", key: plan.key, from: plan.from } },
          seq: context.seq + 1,
        };
      }),
    },
    add: {
      guard: ({ context }) => context.status.todo === "ready" && context.drafts.newCard.trim() !== "",
      actions: assign(({ context, spawn }) => {
        const title = context.drafts.newCard.trim();
        const opId = `op${context.seq}`;
        const key = `n${context.seq}`;
        spawn("request", request(opId, () => addCard("todo", title)));
        return {
          columns: { ...context.columns, todo: [...context.columns.todo, { key, id: null, title, done: 0, total: 0 }] },
          drafts: { ...context.drafts, newCard: "" },
          errors: { ...context.errors, add: null },
          pending: { ...context.pending, [opId]: { kind: "add", key } },
          seq: context.seq + 1,
        };
      }),
    },
    rename: {
      guard: ({ context }) =>
        selectedLocation(context) !== undefined && context.drafts.title.trim() !== "",
      actions: assign(({ context, spawn }) => {
        const hit = selectedLocation(context);
        const title = context.drafts.title.trim();
        if (!hit || hit.card.id === null) return {};
        const id = hit.card.id;
        const opId = `op${context.seq}`;
        spawn("request", request(opId, () => renameCard(id, title)));
        return {
          columns: replaceCard(context.columns, (c) => c.id === id, (c) => ({ ...c, title })),
          drafts: { ...context.drafts, title: "" },
          errors: { ...context.errors, rename: null },
          pending: { ...context.pending, [opId]: { kind: "rename", id, previous: hit.card.title } },
          seq: context.seq + 1,
        };
      }),
    },
    addItem: {
      guard: ({ context }) =>
        context.selectedId !== null && context.checklist === "ready" && context.drafts.item.trim() !== "",
      actions: assign(({ context, spawn }) => {
        const cardId = context.selectedId;
        if (cardId === null) return {};
        const text = context.drafts.item.trim();
        const opId = `op${context.seq}`;
        const key = `n${context.seq}`;
        spawn("request", request(opId, () => addItem(cardId, text)));
        return {
          items: [...context.items, { key, id: null, text, done: false }],
          columns: replaceCard(context.columns, (c) => c.id === cardId, (c) => ({ ...c, total: c.total + 1 })),
          drafts: { ...context.drafts, item: "" },
          errors: { ...context.errors, item: null },
          pending: { ...context.pending, [opId]: { kind: "addItem", cardId, key } },
          seq: context.seq + 1,
        };
      }),
    },
    toggleItem: {
      guard: ({ context, event }) =>
        context.selectedId !== null &&
        context.checklist === "ready" &&
        context.items.some((i) => i.key === event.key && i.id !== null),
      actions: assign(({ context, event, spawn }) => {
        const cardId = context.selectedId;
        const item = context.items.find((i) => i.key === event.key);
        if (cardId === null || !item || item.id === null) return {};
        const itemId = item.id;
        const done = !item.done;
        const opId = `op${context.seq}`;
        spawn("request", request(opId, () => toggleItem(cardId, itemId, done)));
        return {
          items: context.items.map((i) => (i.key === item.key ? { ...i, done } : i)),
          columns: replaceCard(context.columns, (c) => c.id === cardId, (c) => ({ ...c, done: c.done + (done ? 1 : -1) })),
          errors: { ...context.errors, item: null },
          pending: { ...context.pending, [opId]: { kind: "toggle", cardId, key: item.key, done } },
          seq: context.seq + 1,
        };
      }),
    },
    opSucceeded: {
      actions: assign(({ context, event }) => settleOk(context, event.opId, event.output)),
    },
    opFailed: {
      actions: assign(({ context, event }) => settleFailed(context, event.opId, event.error)),
    },
  },
  states: {
    columns: {
      type: "parallel",
      states: { todo: columnState("todo"), doing: columnState("doing"), done: columnState("done") },
    },
    selection: {
      initial: "idle",
      on: {
        select: {
          target: ".open",
          reenter: true,
          guard: ({ context, event }) =>
            event.id !== context.selectedId && locate(context.columns, (c) => c.id === event.id) !== undefined,
          actions: assign(({ context, event }) => ({
            selectedId: event.id,
            items: [],
            checklistError: null,
            drafts: { ...context.drafts, title: "", item: "" },
            errors: { ...context.errors, rename: null, item: null },
          })),
        },
        archive: {
          target: ".idle",
          guard: ({ context }) => {
            const hit = selectedLocation(context);
            return hit !== undefined && hit.card.id !== null && !isMoving(context, hit.card.key);
          },
          actions: assign(({ context, spawn }) => {
            const hit = selectedLocation(context);
            if (!hit || hit.card.id === null) return {};
            const id = hit.card.id;
            const opId = `op${context.seq}`;
            spawn("request", request(opId, () => archiveCard(id)));
            return {
              columns: removeKey(context.columns, hit.card.key),
              selectedId: null,
              items: [],
              checklist: "idle" as const,
              checklistError: null,
              drafts: { ...context.drafts, title: "", item: "" },
              errors: { ...context.errors, archive: null, rename: null, item: null },
              pending: { ...context.pending, [opId]: { kind: "archive", card: hit.card, from: { column: hit.column, index: hit.index } } },
              seq: context.seq + 1,
            };
          }),
        },
      },
      states: {
        idle: {},
        open: {
          initial: "loading",
          states: {
            loading: {
              entry: assign(() => ({ checklist: "loading" as const })),
              invoke: {
                src: "loadChecklist",
                input: ({ context }) => ({ id: context.selectedId as number }),
                onDone: {
                  target: "ready",
                  actions: assign(({ event }) => ({ items: event.output.map(toItemRow) })),
                },
                onError: {
                  target: "failed",
                  actions: assign(({ event }) => ({ checklistError: errorMessage(event.error) })),
                },
              },
            },
            ready: {
              entry: assign(() => ({ checklist: "ready" as const })),
            },
            failed: {
              entry: assign(() => ({ checklist: "failed" as const })),
            },
          },
        },
      },
    },
  },
});
