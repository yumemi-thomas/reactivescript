import type { Column, Item } from "../api";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

/** A card as the board shows it. `id` is null while an add is in flight. */
export type ShownCard = {
  key: string;
  id: number | null;
  title: string;
  done: number;
  total: number;
  adding: boolean;
};

/** A checklist row as the detail shows it. `id` is null while an add is in flight. */
export type ShownItem = { key: string; id: number | null; text: string; done: boolean; adding: boolean };

export type Checklist = { cardId: number; items: ShownItem[] };

/** Everything the board shows that comes from the server. */
export type BoardData = {
  cols: Record<Column, ShownCard[]>;
  checklist: Checklist | null;
};

/**
 * An optimistic change the user made that the server has not settled yet.
 * `confirmed` becomes true when the server accepts; confirmed changes are folded into the
 * server data in the order they were made, so a late answer never reorders history.
 */
export type Op = { seq: number; confirmed: boolean } & (
  | { kind: "move"; id: number; to: Column; index: number }
  | { kind: "rename"; id: number; title: string }
  | { kind: "archive"; id: number }
  | { kind: "addCard"; column: Column; title: string; result?: { id: number; title: string } }
  | { kind: "toggle"; cardId: number; itemId: number; done: boolean; prev: boolean }
  | { kind: "addItem"; cardId: number; text: string; result?: Item }
);

export type OpResult = { card?: { id: number; title: string }; item?: Item };

export const cardKey = (id: number) => `c${id}`;
export const itemKey = (id: number) => `i${id}`;

export const fromServerCard = (c: { id: number; title: string; done: number; total: number }): ShownCard => ({
  key: cardKey(c.id),
  id: c.id,
  title: c.title,
  done: c.done,
  total: c.total,
  adding: false,
});

export const fromServerItem = (i: Item): ShownItem => ({ key: itemKey(i.id), id: i.id, text: i.text, done: i.done, adding: false });

export function findCard(data: BoardData, id: number): { column: Column; index: number; card: ShownCard } | null {
  for (const column of COLUMNS) {
    const index = data.cols[column].findIndex(c => c.id === id);
    if (index >= 0) return { column, index, card: data.cols[column][index] };
  }
  return null;
}

function mapCard(data: BoardData, id: number, f: (c: ShownCard) => ShownCard): BoardData {
  const at = findCard(data, id);
  if (!at) return data;
  const list = data.cols[at.column].slice();
  list[at.index] = f(at.card);
  return { ...data, cols: { ...data.cols, [at.column]: list } };
}

function withChecklist(data: BoardData, cardId: number, f: (items: ShownItem[]) => ShownItem[]): BoardData {
  if (!data.checklist || data.checklist.cardId !== cardId) return data;
  return { ...data, checklist: { cardId, items: f(data.checklist.items) } };
}

/** Applies one change to the data, returning new data (never mutates). */
export function applyOp(data: BoardData, op: Op): BoardData {
  switch (op.kind) {
    case "move": {
      const at = findCard(data, op.id);
      if (!at) return data;
      const cols = { ...data.cols };
      cols[at.column] = cols[at.column].filter(c => c.id !== op.id);
      const target = cols[op.to].slice();
      target.splice(Math.max(0, Math.min(op.index, target.length)), 0, at.card);
      cols[op.to] = target;
      return { ...data, cols };
    }
    case "rename":
      return mapCard(data, op.id, c => ({ ...c, title: op.title }));
    case "archive": {
      const at = findCard(data, op.id);
      if (!at) return data;
      return { ...data, cols: { ...data.cols, [at.column]: data.cols[at.column].filter(c => c.id !== op.id) } };
    }
    case "addCard": {
      const list = data.cols[op.column];
      let card: ShownCard;
      if (op.result) {
        if (findCard(data, op.result.id)) return data;
        card = { key: cardKey(op.result.id), id: op.result.id, title: op.result.title, done: 0, total: 0, adding: false };
      } else {
        card = { key: `new${op.seq}`, id: null, title: op.title, done: 0, total: 0, adding: true };
      }
      return { ...data, cols: { ...data.cols, [op.column]: [...list, card] } };
    }
    case "toggle": {
      let prev = op.prev;
      const known = data.checklist?.cardId === op.cardId ? data.checklist.items.find(i => i.id === op.itemId) : undefined;
      if (known) prev = known.done;
      const delta = (op.done ? 1 : 0) - (prev ? 1 : 0);
      const next = withChecklist(data, op.cardId, items => items.map(i => (i.id === op.itemId ? { ...i, done: op.done } : i)));
      return delta ? mapCard(next, op.cardId, c => ({ ...c, done: c.done + delta })) : next;
    }
    case "addItem": {
      const next = withChecklist(data, op.cardId, items => {
        if (op.result) {
          const result = op.result;
          if (items.some(i => i.id === result.id)) return items;
          return [...items, fromServerItem(result)];
        }
        return [...items, { key: `new${op.seq}`, id: null, text: op.text, done: false, adding: true }];
      });
      return mapCard(next, op.cardId, c => ({ ...c, total: c.total + 1 }));
    }
  }
}

/** The board as shown: the server's data with every unsettled change on top, oldest first. */
export const shown = (data: BoardData, ops: readonly Op[]): BoardData => ops.reduce(applyOp, data);

/** Folds the leading confirmed changes into the server data. */
export function settle(data: BoardData, ops: readonly Op[]): { data: BoardData; ops: Op[] } {
  let i = 0;
  let next = data;
  while (i < ops.length && ops[i].confirmed) next = applyOp(next, ops[i++]);
  return { data: next, ops: ops.slice(i) };
}

export const message = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "something went wrong";

export type Direction = "left" | "right" | "up" | "down";

/** Where a move button would put the card, or null if it has nowhere to go (button hidden). */
export function moveTarget(data: BoardData, id: number, dir: Direction): { from: Column; to: Column; index: number } | null {
  const at = findCard(data, id);
  if (!at) return null;
  const ci = COLUMNS.indexOf(at.column);
  switch (dir) {
    case "left":
    case "right": {
      const to = COLUMNS[ci + (dir === "left" ? -1 : 1)];
      if (!to) return null;
      return { from: at.column, to, index: data.cols[to].length };
    }
    case "up":
      return at.index > 0 ? { from: at.column, to: at.column, index: at.index - 1 } : null;
    case "down":
      return at.index < data.cols[at.column].length - 1 ? { from: at.column, to: at.column, index: at.index + 1 } : null;
  }
}

export type ColumnStatus = "loading" | "error" | "ready";

/** Whether a shown move button can be clicked right now. */
export function moveAllowed(data: BoardData, status: Record<Column, ColumnStatus>, id: number, dir: Direction): boolean {
  const t = moveTarget(data, id, dir);
  if (!t) return false;
  const at = findCard(data, id);
  if (!at || at.card.adding) return false;
  if (status[t.from] !== "ready" || status[t.to] !== "ready") return false;
  if (t.to === "doing" && t.from !== "doing" && data.cols.doing.length >= WIP_LIMIT) return false;
  if (t.from === t.to) {
    const other = data.cols[t.to][t.index];
    if (!other || other.adding) return false;
  }
  return true;
}
