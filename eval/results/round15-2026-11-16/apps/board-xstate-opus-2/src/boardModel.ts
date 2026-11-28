import type { Card, Column, Item } from './api.js';

export const COLUMNS: readonly Column[] = ['todo', 'doing', 'done'];
export const COLUMN_NAMES: Record<Column, string> = { todo: 'To do', doing: 'Doing', done: 'Done' };
export const WIP_LIMIT = 3;

export type Dir = 'left' | 'right' | 'up' | 'down';

/** A write the board has shown but the server has not answered yet. */
export type BoardOp =
  | { opId: string; type: 'moveCard'; id: number; column: Column; index: number }
  | { opId: string; type: 'renameCard'; id: number; title: string }
  | { opId: string; type: 'addCard'; column: Column; title: string }
  | { opId: string; type: 'archiveCard'; id: number }
  | { opId: string; type: 'toggleItem'; cardId: number; itemId: number; done: boolean; delta: number }
  | { opId: string; type: 'addItem'; cardId: number; text: string };

/** Cards per column as the server last confirmed them; null until the column has loaded. */
export type Columns = Record<Column, Card[] | null>;

export type CardRow = { kind: 'card'; card: Card };
export type PendingCardRow = { kind: 'adding'; key: string; title: string };
export type ColumnView = { cards: Card[]; adding: PendingCardRow[] };

export type BoardView = Record<Column, ColumnView | null>;

function locate(cols: Record<Column, Card[] | null>, id: number): { column: Column; index: number } | null {
  for (const column of COLUMNS) {
    const cards = cols[column];
    if (!cards) continue;
    const index = cards.findIndex(c => c.id === id);
    if (index >= 0) return { column, index };
  }
  return null;
}

function cloneColumns(cols: Columns): Columns {
  return {
    todo: cols.todo ? cols.todo.map(c => ({ ...c })) : null,
    doing: cols.doing ? cols.doing.map(c => ({ ...c })) : null,
    done: cols.done ? cols.done.map(c => ({ ...c })) : null,
  };
}

/** Moves card `id` to `index` of `column` in place (clamped). */
function moveIn(cols: Columns, id: number, column: Column, index: number): void {
  const from = locate(cols, id);
  const target = cols[column];
  if (!from || !target) return;
  const source = cols[from.column];
  if (!source) return;
  const [card] = source.splice(from.index, 1);
  target.splice(Math.max(0, Math.min(index, target.length)), 0, card);
}

function updateCard(cols: Columns, id: number, change: (card: Card) => Card): void {
  const at = locate(cols, id);
  if (!at) return;
  const cards = cols[at.column];
  if (cards) cards[at.index] = change(cards[at.index]);
}

/** The board as shown: the confirmed cards with every pending write applied, oldest first. */
export function boardView(base: Columns, ops: readonly BoardOp[]): BoardView {
  const cols = cloneColumns(base);
  const adding: PendingCardRow[] = [];
  for (const op of ops) {
    switch (op.type) {
      case 'moveCard':
        moveIn(cols, op.id, op.column, op.index);
        break;
      case 'renameCard':
        updateCard(cols, op.id, c => ({ ...c, title: op.title }));
        break;
      case 'archiveCard': {
        const at = locate(cols, op.id);
        if (at) cols[at.column]?.splice(at.index, 1);
        break;
      }
      case 'addCard':
        adding.push({ kind: 'adding', key: op.opId, title: op.title });
        break;
      case 'toggleItem':
        updateCard(cols, op.cardId, c => ({ ...c, done: c.done + op.delta }));
        break;
      case 'addItem':
        updateCard(cols, op.cardId, c => ({ ...c, total: c.total + 1 }));
        break;
    }
  }
  const view = (column: Column): ColumnView | null => {
    const cards = cols[column];
    if (!cards) return null;
    return { cards, adding: column === 'todo' ? adding : [] };
  };
  return { todo: view('todo'), doing: view('doing'), done: view('done') };
}

/** Applies a write the server accepted to the confirmed cards. */
export function applyAccepted(base: Columns, op: BoardOp, output: unknown): Columns {
  const cols = cloneColumns(base);
  switch (op.type) {
    case 'moveCard': {
      const out = output as { column?: string; index?: number } | null;
      const column = COLUMNS.find(c => c === out?.column) ?? op.column;
      const index = typeof out?.index === 'number' ? out.index : op.index;
      moveIn(cols, op.id, column, index);
      break;
    }
    case 'renameCard': {
      const out = output as { title?: string } | null;
      const title = typeof out?.title === 'string' ? out.title : op.title;
      updateCard(cols, op.id, c => ({ ...c, title }));
      break;
    }
    case 'archiveCard': {
      const at = locate(cols, op.id);
      if (at) cols[at.column]?.splice(at.index, 1);
      break;
    }
    case 'addCard': {
      const out = output as { id: number; title?: string };
      const title = typeof out.title === 'string' ? out.title : op.title;
      const target = cols[op.column];
      if (target && !target.some(c => c.id === out.id)) target.push({ id: out.id, title, done: 0, total: 0 });
      break;
    }
    case 'toggleItem':
      updateCard(cols, op.cardId, c => ({ ...c, done: c.done + op.delta }));
      break;
    case 'addItem':
      updateCard(cols, op.cardId, c => ({ ...c, total: c.total + 1 }));
      break;
  }
  return cols;
}

export function findCard(view: BoardView, id: number): { card: Card; column: Column; index: number } | null {
  for (const column of COLUMNS) {
    const col = view[column];
    if (!col) continue;
    const index = col.cards.findIndex(c => c.id === id);
    if (index >= 0) return { card: col.cards[index], column, index };
  }
  return null;
}

export type MoveButton = { dir: Dir; disabled: boolean };

function neighbour(column: Column, dir: 'left' | 'right'): Column | null {
  const i = COLUMNS.indexOf(column) + (dir === 'left' ? -1 : 1);
  return COLUMNS[i] ?? null;
}

function shownCount(col: ColumnView): number {
  return col.cards.length + col.adding.length;
}

/** Where a move would put the card, or null when it has nowhere to go or is not allowed now. */
export function moveTarget(
  view: BoardView,
  id: number,
  dir: Dir,
): { column: Column; index: number; shown: true } | { shown: boolean; column?: undefined } {
  const at = findCard(view, id);
  if (!at) return { shown: false };
  const here = view[at.column];
  if (!here) return { shown: false };
  if (dir === 'up') {
    return at.index > 0 ? { column: at.column, index: at.index - 1, shown: true } : { shown: false };
  }
  if (dir === 'down') {
    return at.index < here.cards.length - 1 ? { column: at.column, index: at.index + 1, shown: true } : { shown: false };
  }
  const next = neighbour(at.column, dir);
  if (!next) return { shown: false };
  const target = view[next];
  if (!target) return { shown: true };
  if (next === 'doing' && shownCount(target) >= WIP_LIMIT) return { shown: true };
  return { column: next, index: target.cards.length, shown: true };
}

export function moveButtons(view: BoardView, id: number): MoveButton[] {
  const dirs: Dir[] = ['left', 'right', 'up', 'down'];
  const buttons: MoveButton[] = [];
  for (const dir of dirs) {
    const t = moveTarget(view, id, dir);
    if (t.shown) buttons.push({ dir, disabled: t.column === undefined });
  }
  return buttons;
}

/** A checklist row as shown. */
export type ItemRow =
  | { kind: 'item'; item: Item }
  | { kind: 'adding'; key: string; text: string };

/** The selected card's checklist as shown: confirmed items with that card's pending writes applied. */
export function checklistView(items: readonly Item[] | null, ops: readonly BoardOp[], cardId: number): ItemRow[] | null {
  if (!items) return null;
  const rows: ItemRow[] = items.map(item => ({ kind: 'item', item: { ...item } }));
  for (const op of ops) {
    if (op.type === 'toggleItem' && op.cardId === cardId) {
      const row = rows.find(r => r.kind === 'item' && r.item.id === op.itemId);
      if (row && row.kind === 'item') row.item = { ...row.item, done: op.done };
    } else if (op.type === 'addItem' && op.cardId === cardId) {
      rows.push({ kind: 'adding', key: op.opId, text: op.text });
    }
  }
  return rows;
}
