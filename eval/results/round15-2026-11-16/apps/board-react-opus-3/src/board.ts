// Pure board logic: server-confirmed data plus a queue of optimistic operations.
// What the board shows is always `base` with every pending op applied in order,
// so a declined op is undone just by dropping it, without disturbing the others.
import type { Card, Column, Item } from "./api";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

export type CardRow = Card & { temp?: boolean };
export type ItemRow = Item & { temp?: boolean };

export type ColumnState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ok"; cards: CardRow[] };

export type ChecklistState = {
  status: "loading" | "error" | "ok";
  error: string | null;
  /** last loaded items, kept while reloading so pending ops still have something to apply to */
  items: ItemRow[] | null;
};

export type Data = {
  columns: Record<Column, ColumnState>;
  checklists: Record<number, ChecklistState>;
};

export type Op =
  | { kind: "move"; opId: number; cardId: number; to: Column; index: number }
  | { kind: "rename"; opId: number; cardId: number; title: string }
  | { kind: "addCard"; opId: number; tempId: number; title: string }
  | { kind: "archive"; opId: number; cardId: number }
  | { kind: "toggle"; opId: number; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; opId: number; cardId: number; tempId: number; text: string };

/** What a confirmed op writes into the base data. */
export type Fold =
  | Op
  | { kind: "addCardDone"; card: Card }
  | { kind: "addItemDone"; cardId: number; item: Item };

export const initialData = (): Data => ({
  columns: { todo: { status: "loading" }, doing: { status: "loading" }, done: { status: "loading" } },
  checklists: {},
});

export function findCard(data: Data, cardId: number): { column: Column; index: number; card: CardRow } | null {
  for (const column of COLUMNS) {
    const col = data.columns[column];
    if (col.status !== "ok") continue;
    const index = col.cards.findIndex(c => !c.temp && c.id === cardId);
    if (index >= 0) return { column, index, card: col.cards[index] };
  }
  return null;
}

function setCards(data: Data, column: Column, cards: CardRow[]): Data {
  return { ...data, columns: { ...data.columns, [column]: { status: "ok", cards } } };
}

function updateCard(data: Data, cardId: number, f: (c: CardRow) => CardRow): Data {
  const found = findCard(data, cardId);
  if (!found) return data;
  const col = data.columns[found.column];
  if (col.status !== "ok") return data;
  const cards = col.cards.slice();
  cards[found.index] = f(found.card);
  return setCards(data, found.column, cards);
}

function setItems(data: Data, cardId: number, items: ItemRow[]): Data {
  const prev = data.checklists[cardId];
  if (!prev) return data;
  return { ...data, checklists: { ...data.checklists, [cardId]: { ...prev, items } } };
}

export function apply(data: Data, op: Fold): Data {
  switch (op.kind) {
    case "move": {
      const found = findCard(data, op.cardId);
      const target = data.columns[op.to];
      if (!found || target.status !== "ok") return data;
      const source = data.columns[found.column];
      if (source.status !== "ok") return data;
      const without = source.cards.filter((_, i) => i !== found.index);
      const dest = found.column === op.to ? without : target.cards.slice();
      const index = Math.max(0, Math.min(op.index, dest.length));
      dest.splice(index, 0, found.card);
      const moved = found.column === op.to ? data : setCards(data, found.column, without);
      return setCards(moved, op.to, dest);
    }
    case "rename":
      return updateCard(data, op.cardId, c => ({ ...c, title: op.title }));
    case "archive": {
      const found = findCard(data, op.cardId);
      if (!found) return data;
      const col = data.columns[found.column];
      if (col.status !== "ok") return data;
      return setCards(data, found.column, col.cards.filter((_, i) => i !== found.index));
    }
    case "addCard": {
      const col = data.columns.todo;
      if (col.status !== "ok") return data;
      return setCards(data, "todo", [...col.cards, { id: op.tempId, title: op.title, done: 0, total: 0, temp: true }]);
    }
    case "addCardDone": {
      const col = data.columns.todo;
      if (col.status !== "ok" || findCard(data, op.card.id)) return data;
      return setCards(data, "todo", [...col.cards, op.card]);
    }
    case "toggle": {
      const items = data.checklists[op.cardId]?.items;
      const item = items?.find(i => !i.temp && i.id === op.itemId);
      if (!items || !item || item.done === op.done) return data;
      const next = setItems(data, op.cardId, items.map(i => (i === item ? { ...i, done: op.done } : i)));
      return updateCard(next, op.cardId, c => ({ ...c, done: Math.max(0, c.done + (op.done ? 1 : -1)) }));
    }
    case "addItem": {
      const items = data.checklists[op.cardId]?.items;
      if (!items) return data;
      const next = setItems(data, op.cardId, [...items, { id: op.tempId, text: op.text, done: false, temp: true }]);
      return updateCard(next, op.cardId, c => ({ ...c, total: c.total + 1 }));
    }
    case "addItemDone": {
      const items = data.checklists[op.cardId]?.items;
      if (!items || items.some(i => !i.temp && i.id === op.item.id)) return data;
      const next = setItems(data, op.cardId, [...items, op.item]);
      return updateCard(next, op.cardId, c => ({
        ...c,
        total: c.total + 1,
        done: c.done + (op.item.done ? 1 : 0),
      }));
    }
  }
}

export const view = (base: Data, ops: readonly Op[]): Data => ops.reduce(apply, base);
