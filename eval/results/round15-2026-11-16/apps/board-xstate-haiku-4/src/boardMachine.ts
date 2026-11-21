import { assign, fromPromise, setup } from "xstate";
import { fetchChecklist, type Card, type Item } from "./api";
import { opMachine } from "./ops";
import {
  COLUMNS,
  findCard,
  insertCard,
  mapCards,
  messageOf,
  planMove,
  relocateCard,
  setColumn,
  toCardView,
  toItemView,
  withCards,
  type CardView,
  type Column,
  type ColumnView,
  type Columns,
  type ItemView,
  type MoveDir,
  type Place,
} from "./model";

/** What the board must undo or finish when a server call answers. */
export type Pending =
  | { kind: "load"; column: Column }
  | { kind: "move"; id: number; from: Place }
  | { kind: "add"; key: string }
  | { kind: "rename"; id: number; previous: string }
  | { kind: "archive"; card: CardView; place: Place }
  | { kind: "toggle"; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; cardId: number; key: string };

export type Drafts = { newCard: string; rename: string; item: string };

export type BoardContext = {
  columns: Columns;
  selectedId: number | null;
  drafts: Drafts;
  checklist: { items: ItemView[]; error: string | null };
  moveError: string | null;
  addError: string | null;
  renameError: { cardId: number; message: string } | null;
  itemError: { cardId: number; message: string } | null;
  archiveError: string | null;
  pending: Record<string, Pending>;
  nextOpId: number;
};

export type BoardEvent =
  | { type: "retry"; column: Column }
  | { type: "draft"; field: keyof Drafts; value: string }
  | { type: "move"; id: number; dir: MoveDir }
  | { type: "addCard" }
  | { type: "select"; id: number }
  | { type: "rename" }
  | { type: "archive" }
  | { type: "toggleItem"; itemId: number }
  | { type: "addItem" }
  | { type: "op.done"; opId: string; output: unknown }
  | { type: "op.failed"; opId: string; message: string };

const opIdFor = (n: number) => `op${n}`;
const loadingColumn: ColumnView = { status: "loading", cards: [], error: null };

function selectedOf(context: BoardContext): number {
  if (context.selectedId === null) throw new Error("no card is selected");
  return context.selectedId;
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function onOpDone(context: BoardContext, event: { opId: string; output: unknown }): Partial<BoardContext> {
  const meta = context.pending[event.opId];
  const pending = without(context.pending, event.opId);
  if (!meta) return { pending };
  switch (meta.kind) {
    case "load":
      return {
        pending,
        columns: setColumn(context.columns, meta.column, {
          status: "loaded",
          cards: (event.output as Card[]).map(toCardView),
          error: null,
        }),
      };
    case "add": {
      const { id } = event.output as { id: number };
      return { pending, columns: mapCards(context.columns, (c) => (c.key === meta.key ? { ...c, id } : c)) };
    }
    case "addItem": {
      const { id } = event.output as Item;
      const checklist =
        context.selectedId === meta.cardId
          ? {
              ...context.checklist,
              items: context.checklist.items.map((i) => (i.key === meta.key ? { ...i, id } : i)),
            }
          : context.checklist;
      return { pending, checklist };
    }
    default:
      return { pending };
  }
}

function onOpFailed(context: BoardContext, event: { opId: string; message: string }): Partial<BoardContext> {
  const meta = context.pending[event.opId];
  const pending = without(context.pending, event.opId);
  if (!meta) return { pending };
  const message = event.message;
  switch (meta.kind) {
    case "load":
      return {
        pending,
        columns: setColumn(context.columns, meta.column, { status: "failed", cards: [], error: message }),
      };
    case "move":
      return {
        pending,
        columns: relocateCard(context.columns, meta.id, meta.from),
        moveError: `move error: ${message}`,
      };
    case "add":
      return {
        pending,
        columns: mapCards(context.columns, (c) => (c.key === meta.key ? null : c)),
        addError: `add error: ${message}`,
      };
    case "rename":
      return {
        pending,
        columns: mapCards(context.columns, (c) => (c.id === meta.id ? { ...c, title: meta.previous } : c)),
        renameError: { cardId: meta.id, message: `rename error: ${message}` },
      };
    case "archive":
      return {
        pending,
        columns: insertCard(context.columns, meta.card, meta.place),
        archiveError: `archive error: ${message}`,
      };
    case "toggle": {
      const checklist =
        context.selectedId === meta.cardId
          ? {
              ...context.checklist,
              items: context.checklist.items.map((i) => (i.id === meta.itemId ? { ...i, done: !meta.done } : i)),
            }
          : context.checklist;
      return {
        pending,
        checklist,
        columns: mapCards(context.columns, (c) =>
          c.id === meta.cardId ? { ...c, done: c.done + (meta.done ? -1 : 1) } : c,
        ),
        itemError: { cardId: meta.cardId, message: `item error: ${message}` },
      };
    }
    case "addItem": {
      const checklist =
        context.selectedId === meta.cardId
          ? { ...context.checklist, items: context.checklist.items.filter((i) => i.key !== meta.key) }
          : context.checklist;
      return {
        pending,
        checklist,
        columns: mapCards(context.columns, (c) =>
          c.id === meta.cardId ? { ...c, total: c.total - 1 } : c,
        ),
        itemError: { cardId: meta.cardId, message: `item error: ${message}` },
      };
    }
  }
}

/**
 * The board. Columns load in parallel, one server call each. Every edit (move, add,
 * rename, archive, toggle, add item) shows at once and starts its own server call;
 * the call's outcome comes back as op.done / op.failed and is applied or rolled back.
 * The selected card's checklist is an invoked actor, so it restarts when another card is selected.
 */
export const boardMachine = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: {
    fetchChecklist: fromPromise(({ input }: { input: { cardId: number } }) => fetchChecklist(input.cardId)),
    op: opMachine,
  },
}).createMachine({
  id: "board",
  initial: "none",
  context: {
    columns: { todo: loadingColumn, doing: loadingColumn, done: loadingColumn },
    selectedId: null,
    drafts: { newCard: "", rename: "", item: "" },
    checklist: { items: [], error: null },
    moveError: null,
    addError: null,
    renameError: null,
    itemError: null,
    archiveError: null,
    pending: {},
    nextOpId: 1,
  },
  entry: assign(({ context, spawn }) => {
    let nextOpId = context.nextOpId;
    const pending = { ...context.pending };
    for (const column of COLUMNS) {
      const opId = opIdFor(nextOpId++);
      spawn("op", { id: opId, input: { opId, request: { type: "load", column } } });
      pending[opId] = { kind: "load", column };
    }
    return { pending, nextOpId };
  }),
  on: {
    draft: {
      actions: assign(({ context, event }) => ({ drafts: { ...context.drafts, [event.field]: event.value } })),
    },
    retry: {
      guard: ({ context, event }) => context.columns[event.column].status === "failed",
      actions: assign(({ context, spawn, event }) => {
        const opId = opIdFor(context.nextOpId);
        spawn("op", { id: opId, input: { opId, request: { type: "load", column: event.column } } });
        return {
          columns: setColumn(context.columns, event.column, loadingColumn),
          pending: { ...context.pending, [opId]: { kind: "load", column: event.column } },
          nextOpId: context.nextOpId + 1,
        };
      }),
    },
    move: {
      actions: assign(({ context, spawn, event }) => {
        const plan = planMove(context.columns, event.id, event.dir);
        if (!plan) return {};
        const opId = opIdFor(context.nextOpId);
        spawn("op", {
          id: opId,
          input: { opId, request: { type: "move", id: event.id, column: plan.to.column, index: plan.to.index } },
        });
        return {
          columns: relocateCard(context.columns, event.id, plan.to),
          moveError: null,
          pending: { ...context.pending, [opId]: { kind: "move", id: event.id, from: plan.from } },
          nextOpId: context.nextOpId + 1,
        };
      }),
    },
    addCard: {
      guard: ({ context }) => context.columns.todo.status === "loaded" && context.drafts.newCard.trim() !== "",
      actions: assign(({ context, spawn }) => {
        const title = context.drafts.newCard.trim();
        const opId = opIdFor(context.nextOpId);
        const key = `new-${opId}`;
        spawn("op", { id: opId, input: { opId, request: { type: "add", title } } });
        const card: CardView = { key, id: null, title, done: 0, total: 0 };
        return {
          columns: withCards(context.columns, "todo", [...context.columns.todo.cards, card]),
          drafts: { ...context.drafts, newCard: "" },
          addError: null,
          pending: { ...context.pending, [opId]: { kind: "add", key } },
          nextOpId: context.nextOpId + 1,
        };
      }),
    },
    select: {
      target: ".selected",
      reenter: true,
      guard: ({ context, event }) => event.id !== context.selectedId,
      actions: assign(({ context, event }) => ({
        selectedId: event.id,
        drafts: { ...context.drafts, rename: "" },
        checklist: { items: [], error: null },
        renameError: null,
        itemError: null,
      })),
    },
    rename: {
      guard: ({ context }) => context.selectedId !== null && context.drafts.rename.trim() !== "",
      actions: assign(({ context, spawn }) => {
        const id = selectedOf(context);
        const found = findCard(context.columns, id);
        if (!found) return {};
        const title = context.drafts.rename.trim();
        const opId = opIdFor(context.nextOpId);
        spawn("op", { id: opId, input: { opId, request: { type: "rename", id, title } } });
        return {
          columns: mapCards(context.columns, (c) => (c.id === id ? { ...c, title } : c)),
          renameError: null,
          pending: { ...context.pending, [opId]: { kind: "rename", id, previous: found.card.title } },
          nextOpId: context.nextOpId + 1,
        };
      }),
    },
    archive: {
      target: ".none",
      guard: ({ context }) => context.selectedId !== null,
      actions: assign(({ context, spawn }) => {
        const id = selectedOf(context);
        const found = findCard(context.columns, id);
        if (!found) return { selectedId: null };
        const opId = opIdFor(context.nextOpId);
        spawn("op", { id: opId, input: { opId, request: { type: "archive", id } } });
        return {
          columns: mapCards(context.columns, (c) => (c.id === id ? null : c)),
          selectedId: null,
          archiveError: null,
          pending: {
            ...context.pending,
            [opId]: { kind: "archive", card: found.card, place: { column: found.column, index: found.index } },
          },
          nextOpId: context.nextOpId + 1,
        };
      }),
    },
    "op.done": {
      actions: assign(({ context, event }) => onOpDone(context, event)),
    },
    "op.failed": {
      actions: assign(({ context, event }) => onOpFailed(context, event)),
    },
  },
  states: {
    none: {},
    selected: {
      initial: "loadingChecklist",
      states: {
        loadingChecklist: {
          invoke: {
            src: "fetchChecklist",
            input: ({ context }) => ({ cardId: selectedOf(context) }),
            onDone: {
              target: "loaded",
              actions: assign({
                checklist: ({ event }) => ({ items: event.output.map(toItemView), error: null }),
              }),
            },
            onError: {
              target: "failed",
              actions: assign({
                checklist: ({ event }) => ({ items: [], error: messageOf(event.error) }),
              }),
            },
          },
        },
        loaded: {
          on: {
            toggleItem: {
              actions: assign(({ context, spawn, event }) => {
                const cardId = selectedOf(context);
                const item = context.checklist.items.find((i) => i.id === event.itemId);
                if (!item || item.id === null) return {};
                const done = !item.done;
                const opId = opIdFor(context.nextOpId);
                spawn("op", {
                  id: opId,
                  input: { opId, request: { type: "toggle", cardId, itemId: item.id, done } },
                });
                return {
                  checklist: {
                    ...context.checklist,
                    items: context.checklist.items.map((i) => (i.id === item.id ? { ...i, done } : i)),
                  },
                  columns: mapCards(context.columns, (c) =>
                    c.id === cardId ? { ...c, done: c.done + (done ? 1 : -1) } : c,
                  ),
                  itemError: null,
                  pending: { ...context.pending, [opId]: { kind: "toggle", cardId, itemId: item.id, done } },
                  nextOpId: context.nextOpId + 1,
                };
              }),
            },
            addItem: {
              guard: ({ context }) => context.drafts.item.trim() !== "",
              actions: assign(({ context, spawn }) => {
                const cardId = selectedOf(context);
                const text = context.drafts.item.trim();
                const opId = opIdFor(context.nextOpId);
                const key = `new-${opId}`;
                spawn("op", { id: opId, input: { opId, request: { type: "addItem", cardId, text } } });
                const item: ItemView = { key, id: null, text, done: false };
                return {
                  checklist: { ...context.checklist, items: [...context.checklist.items, item] },
                  columns: mapCards(context.columns, (c) =>
                    c.id === cardId ? { ...c, total: c.total + 1 } : c,
                  ),
                  drafts: { ...context.drafts, item: "" },
                  itemError: null,
                  pending: { ...context.pending, [opId]: { kind: "addItem", cardId, key } },
                  nextOpId: context.nextOpId + 1,
                };
              }),
            },
          },
        },
        failed: {},
      },
    },
  },
});
