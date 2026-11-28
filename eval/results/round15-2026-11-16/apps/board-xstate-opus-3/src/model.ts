import type { Card, Column, Item } from "./api";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

/** A card as the board shows it. `pending` cards are adds the server hasn't answered yet. */
export type BoardCard = Card & { key: string; pending: boolean };
/** A checklist item as the detail shows it. */
export type BoardItem = Item & { key: string; pending: boolean };

export type BoardData = {
  cols: Record<Column, BoardCard[]>;
  /** checklists we know of, by card id */
  items: Record<number, BoardItem[]>;
};

type OpBase = { opId: number; confirmed: boolean };
export type Op = OpBase &
  (
    | { kind: "move"; cardId: number; column: Column; index: number }
    | { kind: "rename"; cardId: number; title: string }
    | { kind: "add"; column: Column; title: string; cardId: number | null }
    | { kind: "archive"; cardId: number }
    | { kind: "toggle"; cardId: number; itemId: number; done: boolean }
    | { kind: "addItem"; cardId: number; text: string; itemId: number | null }
  );

export const emptyData = (): BoardData => ({ cols: { todo: [], doing: [], done: [] }, items: {} });

export const fromServerCards = (cards: Card[]): BoardCard[] =>
  cards.map(c => ({ id: c.id, title: c.title, done: c.done, total: c.total, key: `c${c.id}`, pending: false }));

export const fromServerItems = (items: Item[]): BoardItem[] =>
  items.map(i => ({ id: i.id, text: i.text, done: i.done, key: `i${i.id}`, pending: false }));

export function findCard(data: BoardData, cardId: number): { column: Column; index: number; card: BoardCard } | null {
  for (const column of COLUMNS) {
    const index = data.cols[column].findIndex(c => !c.pending && c.id === cardId);
    if (index >= 0) return { column, index, card: data.cols[column][index] };
  }
  return null;
}

function mapCard(data: BoardData, cardId: number, f: (c: BoardCard) => BoardCard): BoardData {
  const at = findCard(data, cardId);
  if (!at) return data;
  const col = data.cols[at.column].slice();
  col[at.index] = f(at.card);
  return { ...data, cols: { ...data.cols, [at.column]: col } };
}

/** Applies one operation to the board's data. Operations that no longer fit are skipped. */
export function applyOp(data: BoardData, op: Op): BoardData {
  switch (op.kind) {
    case "move": {
      const at = findCard(data, op.cardId);
      if (!at) return data;
      const cols = { ...data.cols, [at.column]: data.cols[at.column].filter((_, i) => i !== at.index) };
      const target = cols[op.column].slice();
      target.splice(Math.min(op.index, target.length), 0, at.card);
      cols[op.column] = target;
      return { ...data, cols };
    }
    case "rename":
      return mapCard(data, op.cardId, c => ({ ...c, title: op.title }));
    case "archive": {
      const at = findCard(data, op.cardId);
      if (!at) return data;
      return { ...data, cols: { ...data.cols, [at.column]: data.cols[at.column].filter((_, i) => i !== at.index) } };
    }
    case "add": {
      if (op.cardId !== null && findCard(data, op.cardId)) return data;
      const card: BoardCard =
        op.cardId === null
          ? { id: -op.opId, title: op.title, done: 0, total: 0, key: `t${op.opId}`, pending: true }
          : { id: op.cardId, title: op.title, done: 0, total: 0, key: `c${op.cardId}`, pending: false };
      return { ...data, cols: { ...data.cols, [op.column]: [...data.cols[op.column], card] } };
    }
    case "toggle": {
      const list = data.items[op.cardId];
      const index = list ? list.findIndex(i => !i.pending && i.id === op.itemId) : -1;
      if (list && index >= 0) {
        if (list[index].done === op.done) return data;
        const next = list.slice();
        next[index] = { ...list[index], done: op.done };
        const withItems = { ...data, items: { ...data.items, [op.cardId]: next } };
        return mapCard(withItems, op.cardId, c => ({ ...c, done: Math.max(0, c.done + (op.done ? 1 : -1)) }));
      }
      return mapCard(data, op.cardId, c => ({ ...c, done: Math.max(0, Math.min(c.total, c.done + (op.done ? 1 : -1))) }));
    }
    case "addItem": {
      const list = data.items[op.cardId];
      if (op.itemId !== null && list?.some(i => !i.pending && i.id === op.itemId)) return data;
      const item: BoardItem =
        op.itemId === null
          ? { id: -op.opId, text: op.text, done: false, key: `t${op.opId}`, pending: true }
          : { id: op.itemId, text: op.text, done: false, key: `i${op.itemId}`, pending: false };
      const withItems = list ? { ...data, items: { ...data.items, [op.cardId]: [...list, item] } } : data;
      return mapCard(withItems, op.cardId, c => ({ ...c, total: c.total + 1 }));
    }
  }
}

/** What the board shows: the server's data with every operation still in the air applied on top, in order. */
export const view = (base: BoardData, ops: Op[]): BoardData => ops.reduce(applyOp, base);

/** Folds the confirmed operations at the head of the queue into the base, keeping the order the user made them in. */
export function settle(base: BoardData, ops: Op[]): { base: BoardData; ops: Op[] } {
  let i = 0;
  while (i < ops.length && ops[i].confirmed) {
    base = applyOp(base, ops[i]);
    i++;
  }
  return { base, ops: i ? ops.slice(i) : ops };
}

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === "string" ? e : String(e);

export type Dir = "left" | "right" | "up" | "down";
export const DIRS: readonly Dir[] = ["left", "right", "up", "down"];
export type MoveOption = { kind: "hidden" } | { kind: "disabled" } | { kind: "ok"; column: Column; index: number };

/** Where each move button of the card at `index` of `column` would take it, given the board as shown. */
export function moveOption(
  shown: BoardData,
  ready: Record<Column, boolean>,
  column: Column,
  index: number,
  dir: Dir,
): MoveOption {
  const cards = shown.cols[column];
  if (cards[index]?.pending !== false) return { kind: "hidden" };
  if (dir === "up" || dir === "down") {
    const to = dir === "up" ? index - 1 : index + 1;
    if (to < 0 || to >= cards.length) return { kind: "hidden" };
    return { kind: "ok", column, index: to };
  }
  const c = COLUMNS.indexOf(column) + (dir === "left" ? -1 : 1);
  if (c < 0 || c >= COLUMNS.length) return { kind: "hidden" };
  const target = COLUMNS[c];
  if (!ready[target]) return { kind: "disabled" };
  if (target === "doing" && shown.cols.doing.length >= WIP_LIMIT) return { kind: "disabled" };
  return { kind: "ok", column: target, index: shown.cols[target].length };
}
