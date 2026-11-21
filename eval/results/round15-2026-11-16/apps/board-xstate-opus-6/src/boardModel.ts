import type { Card, Column, Item } from './api';

export const COLUMNS: readonly Column[] = ['todo', 'doing', 'done'];
export const COLUMN_NAMES: Record<Column, string> = { todo: 'To do', doing: 'Doing', done: 'Done' };
export const WIP_LIMIT = 3;

export type ViewCard = {
  key: string;
  /** null while the card is being added and the server hasn't given it an id */
  id: number | null;
  title: string;
  done: number;
  total: number;
  adding: boolean;
};

export type ViewItem = {
  key: string;
  id: number | null;
  text: string;
  done: boolean;
  adding: boolean;
};

export type World = {
  cols: Record<Column, ViewCard[]>;
  /** checklists by card id, as far as they are known */
  lists: Record<number, ViewItem[]>;
};

type OpBase = { opId: number; ok: boolean; newId: number | null };
export type Op = OpBase &
  (
    | { kind: 'move'; cardId: number; to: Column; index: number }
    | { kind: 'add'; title: string }
    | { kind: 'archive'; cardId: number }
    | { kind: 'rename'; cardId: number; title: string }
    | { kind: 'toggle'; cardId: number; itemId: number; done: boolean }
    | { kind: 'addItem'; cardId: number; text: string }
  );

export type Dir = 'left' | 'right' | 'up' | 'down';
export const DIRS: readonly Dir[] = ['left', 'right', 'up', 'down'];

export type ColStatus = 'loading' | 'ready' | 'failed';

export const emptyWorld: World = { cols: { todo: [], doing: [], done: [] }, lists: {} };

export function toViewCard(card: Card): ViewCard {
  return { key: `c${card.id}`, id: card.id, title: card.title, done: card.done, total: card.total, adding: false };
}

export function toViewItem(item: Item): ViewItem {
  return { key: `i${item.id}`, id: item.id, text: item.text, done: item.done, adding: false };
}

export function findCard(cols: Record<Column, ViewCard[]>, id: number): { column: Column; index: number } | null {
  for (const column of COLUMNS) {
    const index = cols[column].findIndex((c) => c.id === id);
    if (index >= 0) return { column, index };
  }
  return null;
}

function mapCard(world: World, id: number, fn: (card: ViewCard) => ViewCard): World {
  const at = findCard(world.cols, id);
  if (!at) return world;
  const list = world.cols[at.column].slice();
  list[at.index] = fn(list[at.index]);
  return { ...world, cols: { ...world.cols, [at.column]: list } };
}

/** Applies one change to the world. Pure: the board shows the server's state with every unsettled change applied. */
export function applyOp(world: World, op: Op): World {
  switch (op.kind) {
    case 'move': {
      const at = findCard(world.cols, op.cardId);
      if (!at) return world;
      const card = world.cols[at.column][at.index];
      const cols = { ...world.cols, [at.column]: world.cols[at.column].filter((_, i) => i !== at.index) };
      const target = cols[op.to].slice();
      target.splice(Math.min(Math.max(op.index, 0), target.length), 0, card);
      cols[op.to] = target;
      return { ...world, cols };
    }
    case 'add': {
      const card: ViewCard = {
        key: `a${op.opId}`,
        id: op.ok ? op.newId : null,
        title: op.title,
        done: 0,
        total: 0,
        adding: !op.ok,
      };
      return { ...world, cols: { ...world.cols, todo: [...world.cols.todo, card] } };
    }
    case 'archive': {
      const at = findCard(world.cols, op.cardId);
      if (!at) return world;
      return { ...world, cols: { ...world.cols, [at.column]: world.cols[at.column].filter((_, i) => i !== at.index) } };
    }
    case 'rename':
      return mapCard(world, op.cardId, (c) => ({ ...c, title: op.title }));
    case 'toggle': {
      const list = world.lists[op.cardId];
      if (!list) return world;
      const index = list.findIndex((i) => i.id === op.itemId);
      if (index < 0 || list[index].done === op.done) return world;
      const items = list.slice();
      items[index] = { ...items[index], done: op.done };
      const next = { ...world, lists: { ...world.lists, [op.cardId]: items } };
      return mapCard(next, op.cardId, (c) => ({ ...c, done: c.done + (op.done ? 1 : -1) }));
    }
    case 'addItem': {
      const list = world.lists[op.cardId];
      const item: ViewItem = {
        key: `n${op.opId}`,
        id: op.ok ? op.newId : null,
        text: op.text,
        done: false,
        adding: !op.ok,
      };
      const next = list ? { ...world, lists: { ...world.lists, [op.cardId]: [...list, item] } } : world;
      return mapCard(next, op.cardId, (c) => ({ ...c, total: c.total + 1 }));
    }
  }
}

export function deriveWorld(base: World, ops: readonly Op[]): World {
  return ops.reduce(applyOp, base);
}

/** Marks a change as accepted, then folds every accepted change at the head of the queue into the server's state. */
export function confirmOp(base: World, ops: readonly Op[], opId: number, newId: number | null): { base: World; ops: Op[] } {
  let rest = ops.map((op) => (op.opId === opId ? { ...op, ok: true, newId } : op));
  let next = base;
  while (rest.length > 0 && rest[0].ok) {
    next = applyOp(next, rest[0]);
    rest = rest.slice(1);
  }
  return { base: next, ops: rest };
}

export type MoveButton = { kind: 'hidden' } | { kind: 'disabled' } | { kind: 'ok'; to: Column; index: number };

/** Where the move button `dir` beside card `id` takes it, as the board shows it now. */
export function moveTarget(world: World, colStatus: Record<Column, ColStatus>, id: number, dir: Dir): MoveButton {
  const at = findCard(world.cols, id);
  if (!at) return { kind: 'hidden' };
  const cards = world.cols[at.column];
  if (cards[at.index].adding) return { kind: 'hidden' };
  if (dir === 'up' || dir === 'down') {
    const other = at.index + (dir === 'up' ? -1 : 1);
    if (other < 0 || other >= cards.length || cards[other].adding) return { kind: 'hidden' };
    return { kind: 'ok', to: at.column, index: other };
  }
  const c = COLUMNS.indexOf(at.column) + (dir === 'left' ? -1 : 1);
  if (c < 0 || c >= COLUMNS.length) return { kind: 'hidden' };
  const to = COLUMNS[c];
  if (colStatus[to] !== 'ready') return { kind: 'disabled' };
  if (to === 'doing' && world.cols.doing.length >= WIP_LIMIT) return { kind: 'disabled' };
  return { kind: 'ok', to, index: world.cols[to].length };
}
