import { assign, raise, setup, type DoneActorEvent } from "xstate";
import type { Card, Item } from "./api";
import { call, failureOf, launch, valueOf, type CallDone, type Step } from "./calls";
import { COLUMNS, WIP_LIMIT, type BoardCard, type BoardItem, type Column, type Dir, type LoadState, type Pos } from "./types";

type Columns = Record<Column, BoardCard[]>;

export type BoardContext = {
  columns: Columns;
  loads: Record<Column, LoadState>;
  selectedId: number | null;
  items: BoardItem[];
  checklistError: string | null;
  drafts: { newCard: string; title: string; item: string };
  errors: { move: string | null; add: string | null; rename: string | null; item: string | null; archive: string | null };
  /** counter for request ids and local keys */
  seq: number;
};

export type BoardEvent =
  | { type: "select"; id: number }
  | { type: "deselect" }
  | { type: "move"; id: number; dir: Dir }
  | { type: "retry"; column: Column }
  | { type: "typeNewCard"; text: string }
  | { type: "addCard" }
  | { type: "typeTitle"; text: string }
  | { type: "rename" }
  | { type: "archive" }
  | { type: "toggle"; key: string }
  | { type: "typeItem"; text: string }
  | { type: "addItem" }
  | { type: `xstate.done.actor.call.${string}`; output: CallDone };

type Next = Partial<BoardContext>;

/** Where a card of `column` at `index` goes on `dir`, or null when it has nowhere to go. */
export function moveTarget(ctx: BoardContext, pos: Pos, dir: Dir): { to: Pos; disabled: boolean } | null {
  if (dir === "up" || dir === "down") {
    const index = pos.index + (dir === "up" ? -1 : 1);
    if (index < 0 || index >= ctx.columns[pos.column].length) return null;
    return { to: { column: pos.column, index }, disabled: false };
  }
  const at = COLUMNS.indexOf(pos.column) + (dir === "left" ? -1 : 1);
  if (at < 0 || at >= COLUMNS.length) return null;
  const next = COLUMNS[at];
  if (ctx.loads[next].status !== "loaded") return null;
  return {
    to: { column: next, index: ctx.columns[next].length },
    disabled: next === "doing" && ctx.columns.doing.length >= WIP_LIMIT,
  };
}

export function findCard(ctx: BoardContext, id: number): { pos: Pos; card: BoardCard } | undefined {
  for (const column of COLUMNS) {
    const index = ctx.columns[column].findIndex((c) => c.id === id);
    if (index >= 0) return { pos: { column, index }, card: ctx.columns[column][index] };
  }
  return undefined;
}

function lift(columns: Columns, pos: Pos): [Columns, BoardCard] {
  const list = [...columns[pos.column]];
  const [card] = list.splice(pos.index, 1);
  return [{ ...columns, [pos.column]: list }, card];
}

function place(columns: Columns, card: BoardCard, pos: Pos): Columns {
  const list = [...columns[pos.column]];
  list.splice(Math.max(0, Math.min(pos.index, list.length)), 0, card);
  return { ...columns, [pos.column]: list };
}

function mapWhere(columns: Columns, test: (c: BoardCard) => boolean, change: (c: BoardCard) => BoardCard): Columns {
  const each = (list: BoardCard[]) => list.map((c) => (test(c) ? change(c) : c));
  return { todo: each(columns.todo), doing: each(columns.doing), done: each(columns.done) };
}

function dropWhere(columns: Columns, test: (c: BoardCard) => boolean): Columns {
  const keep = (list: BoardCard[]) => list.filter((c) => !test(c));
  return { todo: keep(columns.todo), doing: keep(columns.doing), done: keep(columns.done) };
}

// Planning: each returns the optimistic change and the request, or null when the action is not allowed now.

function planMove(ctx: BoardContext, id: number, dir: Dir): Step<BoardContext> | null {
  const at = findCard(ctx, id);
  if (!at) return null;
  const target = moveTarget(ctx, at.pos, dir);
  if (!target || target.disabled) return null;
  const [columns, card] = lift(ctx.columns, at.pos);
  return {
    patch: { columns: place(columns, card, target.to), errors: { ...ctx.errors, move: null } },
    call: { op: "moveCard", id, column: target.to.column, index: target.to.index, from: at.pos },
  };
}

function planRetry(ctx: BoardContext, column: Column): Step<BoardContext> | null {
  if (ctx.loads[column].status !== "failed") return null;
  return {
    patch: { loads: { ...ctx.loads, [column]: { status: "loading" } } },
    call: { op: "fetchCards", column },
  };
}

function planAdd(ctx: BoardContext): Step<BoardContext> | null {
  const title = ctx.drafts.newCard.trim();
  if (!title || ctx.loads.todo.status !== "loaded") return null;
  const key = `p${ctx.seq}`;
  return {
    patch: {
      columns: { ...ctx.columns, todo: [...ctx.columns.todo, { key, title, done: 0, total: 0 }] },
      drafts: { ...ctx.drafts, newCard: "" },
      errors: { ...ctx.errors, add: null },
    },
    call: { op: "addCard", key, title },
  };
}

function planRename(ctx: BoardContext): Step<BoardContext> | null {
  const title = ctx.drafts.title.trim();
  const id = ctx.selectedId;
  if (!title || id === null) return null;
  const at = findCard(ctx, id);
  if (!at) return null;
  return {
    patch: {
      columns: mapWhere(ctx.columns, (c) => c.id === id, (c) => ({ ...c, title })),
      errors: { ...ctx.errors, rename: null },
    },
    call: { op: "renameCard", id, title, previous: at.card.title },
  };
}

function planArchive(ctx: BoardContext): Step<BoardContext> | null {
  const id = ctx.selectedId;
  if (id === null) return null;
  const at = findCard(ctx, id);
  if (!at) return null;
  const [columns, card] = lift(ctx.columns, at.pos);
  return {
    patch: { columns, errors: { ...ctx.errors, archive: null } },
    call: { op: "archiveCard", id, card, from: at.pos },
  };
}

function planToggle(ctx: BoardContext, key: string): Step<BoardContext> | null {
  const id = ctx.selectedId;
  const item = ctx.items.find((i) => i.key === key);
  if (id === null || !item || item.id === undefined) return null;
  const done = !item.done;
  return {
    patch: {
      items: ctx.items.map((i) => (i.key === key ? { ...i, done } : i)),
      columns: mapWhere(ctx.columns, (c) => c.id === id, (c) => ({ ...c, done: c.done + (done ? 1 : -1) })),
      errors: { ...ctx.errors, item: null },
    },
    call: { op: "toggleItem", cardId: id, key, itemId: item.id, done },
  };
}

function planAddItem(ctx: BoardContext): Step<BoardContext> | null {
  const id = ctx.selectedId;
  const text = ctx.drafts.item.trim();
  if (id === null || !text) return null;
  const key = `p${ctx.seq}`;
  return {
    patch: {
      items: [...ctx.items, { key, text, done: false }],
      columns: mapWhere(ctx.columns, (c) => c.id === id, (c) => ({ ...c, total: c.total + 1 })),
      drafts: { ...ctx.drafts, item: "" },
      errors: { ...ctx.errors, item: null },
    },
    call: { op: "addItem", cardId: id, key, text },
  };
}

// Settling: a request has finished. Successes keep the optimistic state; failures roll it back.

function itemsOf(done: CallDone): BoardItem[] {
  return (valueOf<Item[]>(done) ?? []).map((i) => ({ key: `i${i.id}`, id: i.id, text: i.text, done: i.done }));
}

function settle(ctx: BoardContext, done: CallDone): Next {
  const { input, result } = done;
  switch (input.op) {
    case "fetchCards": {
      if (!result.ok) return { loads: { ...ctx.loads, [input.column]: { status: "failed", message: result.message } } };
      const cards = (result.value as Card[]).map((c) => ({ key: `s${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total }));
      return { loads: { ...ctx.loads, [input.column]: { status: "loaded" } }, columns: { ...ctx.columns, [input.column]: cards } };
    }
    case "moveCard": {
      if (result.ok) return {};
      const errors = { ...ctx.errors, move: `move error: ${result.message}` };
      const at = findCard(ctx, input.id);
      if (!at) return { errors };
      const [columns, card] = lift(ctx.columns, at.pos);
      return { columns: place(columns, card, input.from), errors };
    }
    case "renameCard": {
      if (result.ok) return {};
      return {
        columns: mapWhere(ctx.columns, (c) => c.id === input.id, (c) => ({ ...c, title: input.previous })),
        errors: {
          ...ctx.errors,
          rename: ctx.selectedId === input.id ? `rename error: ${result.message}` : ctx.errors.rename,
        },
      };
    }
    case "addCard": {
      if (result.ok) {
        const id = (result.value as { id: number }).id;
        return { columns: mapWhere(ctx.columns, (c) => c.key === input.key, (c) => ({ ...c, id })) };
      }
      return {
        columns: dropWhere(ctx.columns, (c) => c.key === input.key),
        errors: { ...ctx.errors, add: `add error: ${result.message}` },
      };
    }
    case "archiveCard": {
      if (result.ok) return {};
      return {
        columns: place(ctx.columns, input.card, input.from),
        errors: { ...ctx.errors, archive: `archive error: ${result.message}` },
      };
    }
    case "toggleItem": {
      if (result.ok) return {};
      const delta = input.done ? 1 : -1;
      const shown = ctx.selectedId === input.cardId;
      return {
        columns: mapWhere(ctx.columns, (c) => c.id === input.cardId, (c) => ({ ...c, done: c.done - delta })),
        items: shown ? ctx.items.map((i) => (i.key === input.key ? { ...i, done: !input.done } : i)) : ctx.items,
        errors: shown ? { ...ctx.errors, item: `item error: ${result.message}` } : ctx.errors,
      };
    }
    case "addItem": {
      const shown = ctx.selectedId === input.cardId;
      if (result.ok) {
        const id = (result.value as Item).id;
        return { items: shown ? ctx.items.map((i) => (i.key === input.key ? { ...i, id } : i)) : ctx.items };
      }
      return {
        columns: mapWhere(ctx.columns, (c) => c.id === input.cardId, (c) => ({ ...c, total: c.total - 1 })),
        items: shown ? ctx.items.filter((i) => i.key !== input.key) : ctx.items,
        errors: shown ? { ...ctx.errors, item: `item error: ${result.message}` } : ctx.errors,
      };
    }
    default:
      return {};
  }
}

export const boardMachine = setup({
  types: {
    context: {} as BoardContext,
    events: {} as BoardEvent,
  },
  actors: { call },
}).createMachine({
  id: "board",
  context: {
    columns: { todo: [], doing: [], done: [] },
    loads: { todo: { status: "loading" }, doing: { status: "loading" }, done: { status: "loading" } },
    selectedId: null,
    items: [],
    checklistError: null,
    drafts: { newCard: "", title: "", item: "" },
    errors: { move: null, add: null, rename: null, item: null, archive: null },
    seq: 1,
  },
  entry: assign(({ context, spawn }) => {
    COLUMNS.forEach((column, i) => {
      spawn("call", { id: `call.${context.seq + i}`, input: { op: "fetchCards", column } });
    });
    return { seq: context.seq + COLUMNS.length };
  }),
  initial: "selection",
  states: {
    selection: {
      initial: "none",
      states: {
        none: {
          on: {
            select: {
              guard: ({ context, event }) => findCard(context, event.id) !== undefined,
              target: "card",
              actions: assign(({ context, event }) => ({ selectedId: event.id, items: [], checklistError: null, drafts: { ...context.drafts, title: "", item: "" }, errors: { ...context.errors, rename: null, item: null } })),
            },
          },
        },
        card: {
          initial: "loading",
          on: {
            select: {
              guard: ({ context, event }) => findCard(context, event.id) !== undefined,
              target: ".loading",
              reenter: true,
              actions: assign(({ context, event }) => ({ selectedId: event.id, items: [], checklistError: null, drafts: { ...context.drafts, title: "", item: "" }, errors: { ...context.errors, rename: null, item: null } })),
            },
            deselect: {
              target: "none",
              actions: assign({
                selectedId: null,
                items: [],
                checklistError: null,
                drafts: ({ context }) => ({ ...context.drafts, title: "", item: "" }),
                errors: ({ context }) => ({ ...context.errors, rename: null, item: null }),
              }),
            },
          },
          states: {
            loading: {
              invoke: {
                id: "checklist",
                src: "call",
                input: ({ context }) => ({ op: "fetchChecklist" as const, id: context.selectedId as number }),
                onDone: [
                  {
                    guard: ({ event }) => event.output.result.ok,
                    target: "loaded",
                    actions: assign({ items: ({ event }) => itemsOf(event.output), checklistError: null }),
                  },
                  {
                    target: "failed",
                    actions: assign({ checklistError: ({ event }) => failureOf(event.output) }),
                  },
                ],
              },
            },
            loaded: {
              on: {
                toggle: {
                  actions: assign(({ context, event, spawn }) => launch(context, planToggle(context, event.key), spawn)),
                },
                addItem: {
                  actions: assign(({ context, spawn }) => launch(context, planAddItem(context), spawn)),
                },
              },
            },
            failed: {},
          },
        },
      },
    },
  },
  on: {
    move: {
      actions: assign(({ context, event, spawn }) => launch(context, planMove(context, event.id, event.dir), spawn)),
    },
    retry: {
      actions: assign(({ context, event, spawn }) => launch(context, planRetry(context, event.column), spawn)),
    },
    typeNewCard: {
      actions: assign({ drafts: ({ context, event }) => ({ ...context.drafts, newCard: event.text }) }),
    },
    addCard: {
      actions: assign(({ context, spawn }) => launch(context, planAdd(context), spawn)),
    },
    typeTitle: {
      actions: assign({ drafts: ({ context, event }) => ({ ...context.drafts, title: event.text }) }),
    },
    rename: {
      actions: assign(({ context, spawn }) => launch(context, planRename(context), spawn)),
    },
    archive: {
      actions: [
        assign(({ context, spawn }) => launch(context, planArchive(context), spawn)),
        raise({ type: "deselect" }),
      ],
    },
    typeItem: {
      actions: assign({ drafts: ({ context, event }) => ({ ...context.drafts, item: event.text }) }),
    },
    "xstate.done.actor.call.*": {
      actions: assign(({ context, event }) => settle(context, (event as unknown as DoneActorEvent<CallDone>).output)),
    },
  },
});
