import type { Card, Column, Item } from "./api.js";
import { COLUMNS } from "./shared";

/** Doing holds at most this many cards, counting moves the server has not answered yet. */
export const DOING_LIMIT = 3;

export type UiCard = { key: string; id: number | null; title: string; done: number; total: number };
export type UiItem = { key: string; id: number | null; text: string; done: boolean };

export type ColumnState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; cards: UiCard[] };

export type ChecklistState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; items: UiItem[] };

export type BoardErrorKey = "move" | "add" | "archive" | "rename" | "item";

export type BoardState = {
  columns: Record<Column, ColumnState>;
  selectedId: number | null;
  /** keyed by card id; only the selected card's entry is shown */
  checklists: Record<number, ChecklistState>;
  errors: Partial<Record<BoardErrorKey, string>>;
};

export type Action =
  | { type: "columnLoading"; column: Column }
  | { type: "columnLoaded"; column: Column; cards: Card[] }
  | { type: "columnFailed"; column: Column; message: string }
  | { type: "place"; id: number; column: Column; index: number }
  | { type: "setError"; key: BoardErrorKey; message: string | undefined }
  | { type: "addPending"; key: string; title: string }
  | { type: "addResolved"; key: string; id: number }
  | { type: "removePending"; key: string }
  | { type: "select"; id: number }
  | { type: "setTitle"; id: number; title: string }
  | { type: "archive"; id: number }
  | { type: "insertCard"; column: Column; index: number; card: UiCard }
  | { type: "checklistLoaded"; id: number; items: Item[] }
  | { type: "checklistFailed"; id: number; message: string }
  | { type: "setItemDone"; cardId: number; itemId: number; done: boolean }
  | { type: "addItemPending"; cardId: number; key: string; text: string }
  | { type: "resolveItem"; cardId: number; key: string; id: number }
  | { type: "removeItem"; cardId: number; key: string };

export const initialBoard: BoardState = {
  columns: {
    todo: { status: "loading" },
    doing: { status: "loading" },
    done: { status: "loading" },
  },
  selectedId: null,
  checklists: {},
  errors: {},
};

export type Location = { column: Column; index: number; card: UiCard };
export type Move = { dir: "left" | "right" | "up" | "down"; column: Column; index: number; disabled: boolean };

export function cardsOf(state: BoardState, column: Column): UiCard[] {
  const s = state.columns[column];
  return s.status === "ok" ? s.cards : [];
}

export function findCard(state: BoardState, id: number): Location | undefined {
  for (const column of COLUMNS) {
    const cards = cardsOf(state, column);
    const index = cards.findIndex(c => c.id === id);
    if (index >= 0) return { column, index, card: cards[index] };
  }
  return undefined;
}

/** Whether a card may be moved into `column` right now. */
export function canEnter(state: BoardState, column: Column): boolean {
  const s = state.columns[column];
  if (s.status !== "ok") return false;
  return !(column === "doing" && s.cards.length >= DOING_LIMIT);
}

/** The move buttons a card shows: only the ones that have somewhere to go. */
export function movesFor(state: BoardState, loc: Location): Move[] {
  const moves: Move[] = [];
  const ci = COLUMNS.indexOf(loc.column);
  if (ci > 0) {
    const column = COLUMNS[ci - 1];
    moves.push({ dir: "left", column, index: cardsOf(state, column).length, disabled: !canEnter(state, column) });
  }
  if (ci < COLUMNS.length - 1) {
    const column = COLUMNS[ci + 1];
    moves.push({ dir: "right", column, index: cardsOf(state, column).length, disabled: !canEnter(state, column) });
  }
  if (loc.index > 0) {
    moves.push({ dir: "up", column: loc.column, index: loc.index - 1, disabled: false });
  }
  if (loc.index < cardsOf(state, loc.column).length - 1) {
    moves.push({ dir: "down", column: loc.column, index: loc.index + 1, disabled: false });
  }
  return moves;
}

function setColumnState(state: BoardState, column: Column, s: ColumnState): BoardState {
  const columns = { ...state.columns };
  columns[column] = s;
  return { ...state, columns };
}

function setCards(state: BoardState, column: Column, cards: UiCard[]): BoardState {
  return setColumnState(state, column, { status: "ok", cards });
}

function mapCards(state: BoardState, pred: (c: UiCard) => boolean, fn: (c: UiCard) => UiCard): BoardState {
  let next = state;
  for (const column of COLUMNS) {
    const cards = cardsOf(state, column);
    if (cards.some(pred)) next = setCards(next, column, cards.map(c => (pred(c) ? fn(c) : c)));
  }
  return next;
}

function removeCards(state: BoardState, pred: (c: UiCard) => boolean): BoardState {
  let next = state;
  for (const column of COLUMNS) {
    const cards = cardsOf(state, column);
    if (cards.some(pred)) next = setCards(next, column, cards.filter(c => !pred(c)));
  }
  return next;
}

/** Takes card `id` out of whatever column holds it and puts it at `index` of `column`. */
function place(state: BoardState, id: number, column: Column, index: number): BoardState {
  const loc = findCard(state, id);
  if (!loc || state.columns[column].status !== "ok") return state;
  const without = removeCards(state, c => c.id === id);
  const cards = [...cardsOf(without, column)];
  cards.splice(Math.min(Math.max(index, 0), cards.length), 0, loc.card);
  return setCards(without, column, cards);
}

function okItems(state: BoardState, cardId: number): UiItem[] | undefined {
  const cl = state.checklists[cardId];
  return cl && cl.status === "ok" ? cl.items : undefined;
}

function updateChecklist(state: BoardState, cardId: number, fn: (items: UiItem[]) => UiItem[]): BoardState {
  const items = okItems(state, cardId);
  if (!items) return state;
  return { ...state, checklists: { ...state.checklists, [cardId]: { status: "ok", items: fn(items) } } };
}

function setItemDone(state: BoardState, cardId: number, itemId: number, done: boolean): BoardState {
  const items = okItems(state, cardId);
  const item = items?.find(i => i.id === itemId);
  if (!items || !item || item.done === done) return state;
  const next = updateChecklist(state, cardId, list => list.map(i => (i.id === itemId ? { ...i, done } : i)));
  return mapCards(next, c => c.id === cardId, c => ({ ...c, done: c.done + (done ? 1 : -1) }));
}

export function boardReducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case "columnLoading":
      return setColumnState(state, action.column, { status: "loading" });

    case "columnLoaded":
      return setColumnState(state, action.column, {
        status: "ok",
        cards: action.cards.map(card => ({
          key: `c${card.id}`,
          id: card.id,
          title: card.title,
          done: card.done,
          total: card.total,
        })),
      });

    case "columnFailed":
      return setColumnState(state, action.column, { status: "error", message: action.message });

    case "place":
      return place(state, action.id, action.column, action.index);

    case "setError":
      return { ...state, errors: { ...state.errors, [action.key]: action.message } };

    case "addPending": {
      if (state.columns.todo.status !== "ok") return state;
      const cards = [
        ...cardsOf(state, "todo"),
        { key: action.key, id: null, title: action.title, done: 0, total: 0 },
      ];
      return setCards(state, "todo", cards);
    }

    case "addResolved":
      return mapCards(state, c => c.key === action.key, c => ({ ...c, id: action.id }));

    case "removePending":
      return removeCards(state, c => c.key === action.key);

    case "select":
      return {
        ...state,
        selectedId: action.id,
        errors: { ...state.errors, rename: undefined, item: undefined },
        checklists: { ...state.checklists, [action.id]: { status: "loading" } },
      };

    case "setTitle":
      return mapCards(state, c => c.id === action.id, c => ({ ...c, title: action.title }));

    case "archive":
      return { ...removeCards(state, c => c.id === action.id), selectedId: null };

    case "insertCard": {
      if (state.columns[action.column].status !== "ok") return state;
      const cards = [...cardsOf(state, action.column)];
      cards.splice(Math.min(Math.max(action.index, 0), cards.length), 0, action.card);
      return setCards(state, action.column, cards);
    }

    case "checklistLoaded":
      return {
        ...state,
        checklists: {
          ...state.checklists,
          [action.id]: {
            status: "ok",
            items: action.items.map(i => ({ key: `i${i.id}`, id: i.id, text: i.text, done: i.done })),
          },
        },
      };

    case "checklistFailed":
      return { ...state, checklists: { ...state.checklists, [action.id]: { status: "error", message: action.message } } };

    case "setItemDone":
      return setItemDone(state, action.cardId, action.itemId, action.done);

    case "addItemPending": {
      const next = updateChecklist(state, action.cardId, items => [
        ...items,
        { key: action.key, id: null, text: action.text, done: false },
      ]);
      if (next === state) return state;
      return mapCards(next, c => c.id === action.cardId, c => ({ ...c, total: c.total + 1 }));
    }

    case "resolveItem":
      return updateChecklist(state, action.cardId, items =>
        items.map(i => (i.key === action.key ? { ...i, id: action.id } : i)),
      );

    case "removeItem": {
      const items = okItems(state, action.cardId);
      if (!items || !items.some(i => i.key === action.key)) return state;
      const next = updateChecklist(state, action.cardId, list => list.filter(i => i.key !== action.key));
      return mapCards(next, c => c.id === action.cardId, c => ({ ...c, total: c.total - 1 }));
    }
  }
}
