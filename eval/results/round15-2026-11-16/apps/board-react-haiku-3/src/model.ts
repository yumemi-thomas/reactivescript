import type { Card, Column, Item } from "./api.js";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAME: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

export type Dir = "left" | "right" | "up" | "down";
export const DIRS: readonly Dir[] = ["left", "right", "up", "down"];

export type Status = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };
const LOADING: Status = { kind: "loading" };
const READY: Status = { kind: "ready" };

/** A card as the board shows it. `id` is null while the server has not yet answered an add. */
export interface CardView {
  key: string;
  id: number | null;
  title: string;
  done: number;
  total: number;
}

/** A checklist item as the detail shows it. `id` is null while the server has not yet answered an add. */
export interface ItemView {
  key: string;
  id: number | null;
  text: string;
  done: boolean;
}

export interface ColumnState {
  status: Status;
  cards: CardView[];
}

export interface Checklist {
  status: Status;
  items: ItemView[];
}

export interface Detail {
  cardId: number;
  checklist: Checklist;
  renameError: string | null;
  itemError: string | null;
}

export interface BoardState {
  columns: Record<Column, ColumnState>;
  detail: Detail | null;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
}

export interface Location {
  column: Column;
  index: number;
  card: CardView;
}

export interface Target {
  column: Column;
  index: number;
}

export type Availability = "hidden" | "disabled" | "enabled";

export type Action =
  | { type: "loadStart"; column: Column }
  | { type: "loadDone"; column: Column; cards: Card[] }
  | { type: "loadFail"; column: Column; message: string }
  | { type: "moveStart"; id: number; column: Column; index: number }
  | { type: "moveRollback"; id: number; column: Column; index: number; message: string }
  | { type: "addStart"; key: string; title: string }
  | { type: "addAccepted"; key: string; id: number; title: string }
  | { type: "addRollback"; key: string; message: string }
  | { type: "select"; id: number }
  | { type: "checklistLoaded"; cardId: number; items: Item[] }
  | { type: "checklistFailed"; cardId: number; message: string }
  | { type: "renameStart"; id: number; title: string }
  | { type: "renameRollback"; id: number; previous: string; message: string }
  | { type: "archiveStart"; id: number }
  | { type: "archiveRollback"; id: number; column: Column; index: number; card: CardView; message: string }
  | { type: "toggleStart"; cardId: number; itemId: number; done: boolean }
  | { type: "toggleRollback"; cardId: number; itemId: number; done: boolean; message: string }
  | { type: "itemAddStart"; cardId: number; key: string; text: string }
  | { type: "itemAddAccepted"; cardId: number; key: string; id: number; text: string }
  | { type: "itemAddRollback"; cardId: number; key: string; message: string };

export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function initialBoard(): BoardState {
  const loading = (): ColumnState => ({ status: LOADING, cards: [] });
  return {
    columns: { todo: loading(), doing: loading(), done: loading() },
    detail: null,
    moveError: null,
    addError: null,
    archiveError: null,
  };
}

export function locate(state: BoardState, id: number): Location | null {
  for (const column of COLUMNS) {
    const cards = state.columns[column].cards;
    const index = cards.findIndex(c => c.id === id);
    if (index !== -1) return { column, index, card: cards[index] };
  }
  return null;
}

/** Where a card goes for a move button: left/right go to the bottom of the neighbouring column, up/down swap. */
export function moveTarget(state: BoardState, loc: Location, dir: Dir): Target | null {
  if (dir === "up") return loc.index > 0 ? { column: loc.column, index: loc.index - 1 } : null;
  if (dir === "down") {
    return loc.index < state.columns[loc.column].cards.length - 1 ? { column: loc.column, index: loc.index + 1 } : null;
  }
  const at = COLUMNS.indexOf(loc.column) + (dir === "right" ? 1 : -1);
  if (at < 0 || at >= COLUMNS.length) return null;
  const column = COLUMNS[at];
  return { column, index: state.columns[column].cards.length };
}

export function moveAvailability(state: BoardState, loc: Location, dir: Dir): Availability {
  const target = moveTarget(state, loc, dir);
  if (target === null) return "hidden";
  const dest = state.columns[target.column];
  if (dest.status.kind !== "ready") return "disabled";
  if (loc.column !== "doing" && target.column === "doing" && dest.cards.length >= WIP_LIMIT) return "disabled";
  return "enabled";
}

export function progress(items: readonly ItemView[]): { done: number; total: number } {
  return { done: items.filter(i => i.done).length, total: items.length };
}

function toCard(c: Card): CardView {
  return { key: `c${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total };
}

function toItem(i: Item): ItemView {
  return { key: `i${i.id}`, id: i.id, text: i.text, done: i.done };
}

function setColumn(state: BoardState, column: Column, col: ColumnState): BoardState {
  return { ...state, columns: { ...state.columns, [column]: col } };
}

function patchList<T>(list: readonly T[], match: (t: T) => boolean, fn: (t: T) => T | null): T[] {
  const out: T[] = [];
  for (const t of list) {
    if (!match(t)) {
      out.push(t);
      continue;
    }
    const replaced = fn(t);
    if (replaced !== null) out.push(replaced);
  }
  return out;
}

function patchCards(state: BoardState, match: (c: CardView) => boolean, fn: (c: CardView) => CardView | null): BoardState {
  let next = state;
  for (const column of COLUMNS) {
    const col = state.columns[column];
    if (col.cards.some(match)) next = setColumn(next, column, { status: col.status, cards: patchList(col.cards, match, fn) });
  }
  return next;
}

function removeCard(state: BoardState, id: number): BoardState {
  return patchCards(state, c => c.id === id, () => null);
}

function insertCard(state: BoardState, column: Column, index: number, card: CardView): BoardState {
  const col = state.columns[column];
  const cards = col.cards.slice();
  cards.splice(Math.max(0, Math.min(index, cards.length)), 0, card);
  return setColumn(state, column, { status: col.status, cards });
}

function patchDetail(state: BoardState, cardId: number, fn: (d: Detail) => Detail): BoardState {
  if (state.detail === null || state.detail.cardId !== cardId) return state;
  return { ...state, detail: fn(state.detail) };
}

function setToggle(state: BoardState, cardId: number, itemId: number, done: boolean, error: string | null): BoardState {
  const delta = done ? 1 : -1;
  const withItem = patchDetail(state, cardId, d => ({
    ...d,
    itemError: error,
    checklist: {
      ...d.checklist,
      items: patchList(d.checklist.items, i => i.id === itemId, i => ({ ...i, done })),
    },
  }));
  return patchCards(withItem, c => c.id === cardId, c => ({ ...c, done: Math.max(0, c.done + delta) }));
}

export function boardReducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case "loadStart":
      return setColumn(state, action.column, { status: LOADING, cards: [] });

    case "loadDone":
      if (state.columns[action.column].status.kind !== "loading") return state;
      return setColumn(state, action.column, { status: READY, cards: action.cards.map(toCard) });

    case "loadFail":
      if (state.columns[action.column].status.kind !== "loading") return state;
      return setColumn(state, action.column, { status: { kind: "error", message: action.message }, cards: [] });

    case "moveStart": {
      const loc = locate(state, action.id);
      if (loc === null) return { ...state, moveError: null };
      return { ...insertCard(removeCard(state, action.id), action.column, action.index, loc.card), moveError: null };
    }

    case "moveRollback": {
      const loc = locate(state, action.id);
      const next = loc === null ? state : insertCard(removeCard(state, action.id), action.column, action.index, loc.card);
      return { ...next, moveError: `move error: ${action.message}` };
    }

    case "addStart":
      return {
        ...insertCard(state, "todo", state.columns.todo.cards.length, {
          key: action.key,
          id: null,
          title: action.title,
          done: 0,
          total: 0,
        }),
        addError: null,
      };

    case "addAccepted":
      return patchCards(state, c => c.key === action.key, c => ({
        ...c,
        key: `c${action.id}`,
        id: action.id,
        title: action.title,
      }));

    case "addRollback":
      return { ...patchCards(state, c => c.key === action.key, () => null), addError: `add error: ${action.message}` };

    case "select":
      return {
        ...state,
        detail: { cardId: action.id, checklist: { status: LOADING, items: [] }, renameError: null, itemError: null },
      };

    case "checklistLoaded":
      return patchDetail(state, action.cardId, d =>
        d.checklist.status.kind !== "loading" ? d : { ...d, checklist: { status: READY, items: action.items.map(toItem) } },
      );

    case "checklistFailed":
      return patchDetail(state, action.cardId, d =>
        d.checklist.status.kind !== "loading"
          ? d
          : { ...d, checklist: { status: { kind: "error", message: action.message }, items: [] } },
      );

    case "renameStart":
      return patchDetail(
        patchCards(state, c => c.id === action.id, c => ({ ...c, title: action.title })),
        action.id,
        d => ({ ...d, renameError: null }),
      );

    case "renameRollback":
      return patchDetail(
        patchCards(state, c => c.id === action.id, c => ({ ...c, title: action.previous })),
        action.id,
        d => ({ ...d, renameError: `rename error: ${action.message}` }),
      );

    case "archiveStart":
      return { ...removeCard(state, action.id), detail: null, archiveError: null };

    case "archiveRollback": {
      const next = locate(state, action.id) === null ? insertCard(state, action.column, action.index, action.card) : state;
      return { ...next, archiveError: `archive error: ${action.message}` };
    }

    case "toggleStart":
      return setToggle(state, action.cardId, action.itemId, action.done, null);

    case "toggleRollback":
      return setToggle(state, action.cardId, action.itemId, !action.done, `item error: ${action.message}`);

    case "itemAddStart": {
      const withItem = patchDetail(state, action.cardId, d => ({
        ...d,
        itemError: null,
        checklist: {
          ...d.checklist,
          items: [...d.checklist.items, { key: action.key, id: null, text: action.text, done: false }],
        },
      }));
      return patchCards(withItem, c => c.id === action.cardId, c => ({ ...c, total: c.total + 1 }));
    }

    case "itemAddAccepted":
      return patchDetail(state, action.cardId, d => ({
        ...d,
        checklist: {
          ...d.checklist,
          items: patchList(d.checklist.items, i => i.key === action.key, () => ({
            key: `i${action.id}`,
            id: action.id,
            text: action.text,
            done: false,
          })),
        },
      }));

    case "itemAddRollback": {
      const withoutItem = patchDetail(state, action.cardId, d => ({
        ...d,
        itemError: `item error: ${action.message}`,
        checklist: { ...d.checklist, items: patchList(d.checklist.items, i => i.key === action.key, () => null) },
      }));
      return patchCards(withoutItem, c => c.id === action.cardId, c => ({ ...c, total: Math.max(0, c.total - 1) }));
    }
  }
}
