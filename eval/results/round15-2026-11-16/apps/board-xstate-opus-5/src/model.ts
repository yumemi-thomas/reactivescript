import type { Card, Column, Item } from "./api";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

/** A card as the board holds it. `id` is null while the server has not answered an add. */
export type BoardCard = { key: string; id: number | null; title: string; done: number; total: number };
/** A checklist item as the board holds it. `id` is null while the server has not answered an add. */
export type BoardItem = { key: string; id: number | null; text: string; done: boolean };

export type BoardData = {
  /** null while the column has not loaded */
  columns: Record<Column, BoardCard[] | null>;
  /** checklists of cards, by card id, as last fetched */
  lists: Record<number, BoardItem[]>;
};

/** A change the user made that the server has not confirmed yet (or confirmed, waiting for earlier ones). */
export type Op =
  | { kind: "move"; id: number; column: Column; index: number }
  | { kind: "add"; column: Column; title: string; newId?: number }
  | { kind: "rename"; id: number; title: string }
  | { kind: "archive"; id: number }
  | { kind: "toggle"; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; cardId: number; text: string; newId?: number };

export type PendingOp = { opId: number; op: Op; confirmed: boolean };

export const emptyData = (): BoardData => ({ columns: { todo: null, doing: null, done: null }, lists: {} });

export const fromCard = (c: Card): BoardCard => ({ key: `c${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total });
export const fromItem = (i: Item): BoardItem => ({ key: `i${i.id}`, id: i.id, text: i.text, done: i.done });

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

export function locate(data: BoardData, id: number): { column: Column; index: number } | null {
  for (const column of COLUMNS) {
    const cards = data.columns[column];
    const index = cards ? cards.findIndex(c => c.id === id) : -1;
    if (index >= 0) return { column, index };
  }
  return null;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Applies one change to the data, returning new data (the input is not modified). */
export function applyOp(data: BoardData, p: PendingOp): BoardData {
  const { op, opId } = p;
  const columns = { ...data.columns };
  switch (op.kind) {
    case "move": {
      const at = locate(data, op.id);
      const target = columns[op.column];
      if (!at || !target) return data;
      const from = [...columns[at.column]!];
      const [card] = from.splice(at.index, 1);
      columns[at.column] = from;
      const to = at.column === op.column ? from : [...target];
      to.splice(clamp(op.index, 0, to.length), 0, card);
      columns[op.column] = to;
      return { ...data, columns };
    }
    case "add": {
      const cards = columns[op.column];
      if (!cards) return data;
      // a reload may already hold the card the server added
      if (op.newId !== undefined && locate(data, op.newId)) return data;
      const card: BoardCard =
        op.newId === undefined
          ? { key: `t${opId}`, id: null, title: op.title, done: 0, total: 0 }
          : { key: `c${op.newId}`, id: op.newId, title: op.title, done: 0, total: 0 };
      columns[op.column] = [...cards, card];
      return { ...data, columns };
    }
    case "rename": {
      const at = locate(data, op.id);
      if (!at) return data;
      columns[at.column] = columns[at.column]!.map(c => (c.id === op.id ? { ...c, title: op.title } : c));
      return { ...data, columns };
    }
    case "archive": {
      const at = locate(data, op.id);
      if (!at) return data;
      columns[at.column] = columns[at.column]!.filter(c => c.id !== op.id);
      return { ...data, columns };
    }
    case "toggle": {
      const list = data.lists[op.cardId];
      if (!list) return data;
      return {
        ...data,
        lists: { ...data.lists, [op.cardId]: list.map(i => (i.id === op.itemId ? { ...i, done: op.done } : i)) },
      };
    }
    case "addItem": {
      const list = data.lists[op.cardId];
      if (!list) return data;
      if (op.newId !== undefined && list.some(i => i.id === op.newId)) return data;
      const item: BoardItem =
        op.newId === undefined
          ? { key: `t${opId}`, id: null, text: op.text, done: false }
          : { key: `i${op.newId}`, id: op.newId, text: op.text, done: false };
      return { ...data, lists: { ...data.lists, [op.cardId]: [...list, item] } };
    }
  }
}

const stats = (list: BoardItem[] | undefined) =>
  list ? { done: list.filter(i => i.done).length, total: list.length } : { done: 0, total: 0 };

/**
 * Card counts follow checklist changes: each card's counts move by how much its checklist in `after`
 * differs from its checklist in `before`.
 */
function withCounts(before: BoardData, after: BoardData): BoardData {
  const columns = { ...after.columns };
  for (const column of COLUMNS) {
    const cards = columns[column];
    if (!cards) continue;
    columns[column] = cards.map(c => {
      if (c.id === null) return c;
      const was = before.lists[c.id];
      const now = after.lists[c.id];
      if (was === now || !was || !now) return c;
      const a = stats(was);
      const b = stats(now);
      if (a.done === b.done && a.total === b.total) return c;
      return {
        ...c,
        done: Math.max(0, c.done + b.done - a.done),
        total: Math.max(0, c.total + b.total - a.total),
      };
    });
  }
  return { ...after, columns };
}

/** What the board shows: the server's data with every change still in play applied, in the order made. */
export function shown(base: BoardData, ops: PendingOp[]): BoardData {
  return withCounts(base, ops.reduce(applyOp, base));
}

/** Folds confirmed changes at the head of the queue into the base, so the queue keeps the order they were made. */
export function compact(base: BoardData, ops: PendingOp[]): { base: BoardData; ops: PendingOp[] } {
  let i = 0;
  let next = base;
  while (i < ops.length && ops[i].confirmed) next = applyOp(next, ops[i++]);
  return i === 0 ? { base, ops } : { base: withCounts(base, next), ops: ops.slice(i) };
}
