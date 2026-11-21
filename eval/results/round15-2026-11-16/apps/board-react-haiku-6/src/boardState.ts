import type { Card, Column } from "./api.js";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAME: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

export type Dir = "left" | "right" | "up" | "down";

/** A card as the board shows it. `id` is null while the server has not yet answered an add. */
export type BoardCard = { key: string; id: number | null; title: string; done: number; total: number };

export type ColumnState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; cards: BoardCard[] };

export type Board = Record<Column, ColumnState>;

export const INITIAL_BOARD: Board = {
  todo: { status: "loading" },
  doing: { status: "loading" },
  done: { status: "loading" },
};

export type Located = { card: BoardCard; column: Column; index: number };

export type Action =
  | { type: "loading"; column: Column }
  | { type: "loaded"; column: Column; cards: Card[] }
  | { type: "failed"; column: Column; message: string }
  | { type: "move"; id: number; to: Column; index: number }
  | { type: "insert"; card: BoardCard; column: Column; index: number }
  | { type: "addPending"; key: string; title: string }
  | { type: "addAccepted"; key: string; id: number }
  | { type: "removeKey"; key: string }
  | { type: "rename"; id: number; title: string }
  | { type: "remove"; id: number }
  | { type: "adjust"; id: number; dDone: number; dTotal: number };

let keySeq = 0;
/** A React key for a card or item that exists only on this page. Called from event handlers. */
export function newKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toBoardCard(card: Card): BoardCard {
  return { key: `card-${card.id}`, id: card.id, title: card.title, done: card.done, total: card.total };
}

export function cardsIn(board: Board, column: Column): BoardCard[] {
  const state = board[column];
  return state.status === "ok" ? state.cards : [];
}

export function findCard(board: Board, id: number): Located | undefined {
  for (const column of COLUMNS) {
    const index = cardsIn(board, column).findIndex(card => card.id === id);
    if (index >= 0) return { card: cardsIn(board, column)[index], column, index };
  }
  return undefined;
}

export function isDoingFull(board: Board): boolean {
  return cardsIn(board, "doing").length >= WIP_LIMIT;
}

/** Whether a card in `from` may be moved into `to` (including reordering within `from`). */
export function canMoveTo(board: Board, from: Column, to: Column): boolean {
  if (board[from].status !== "ok" || board[to].status !== "ok") return false;
  if (to !== from && to === "doing" && isDoingFull(board)) return false;
  return true;
}

function withColumn(board: Board, column: Column, state: ColumnState): Board {
  const next: Board = { ...board };
  next[column] = state;
  return next;
}

function mapColumns(board: Board, change: (cards: BoardCard[]) => BoardCard[]): Board {
  const next: Board = { ...board };
  for (const column of COLUMNS) {
    const state = board[column];
    if (state.status === "ok") next[column] = { status: "ok", cards: change(state.cards) };
  }
  return next;
}

/** Takes a card off the board, returning the board without it and the card. */
function take(board: Board, id: number): { board: Board; card: BoardCard | undefined } {
  const found = findCard(board, id);
  if (!found) return { board, card: undefined };
  const next: Board = { ...board };
  next[found.column] = { status: "ok", cards: cardsIn(board, found.column).filter((_, i) => i !== found.index) };
  return { board: next, card: found.card };
}

/** Puts a card into a column at `index` (clamped to the column's length). */
function put(board: Board, card: BoardCard, column: Column, index: number): Board {
  const state = board[column];
  if (state.status !== "ok") return board;
  const cards = [...state.cards];
  cards.splice(Math.min(Math.max(index, 0), cards.length), 0, card);
  return withColumn(board, column, { status: "ok", cards });
}

export function boardReducer(board: Board, action: Action): Board {
  switch (action.type) {
    case "loading":
      return withColumn(board, action.column, { status: "loading" });
    case "loaded":
      return withColumn(board, action.column, { status: "ok", cards: action.cards.map(toBoardCard) });
    case "failed":
      return withColumn(board, action.column, { status: "error", message: action.message });
    case "move": {
      const taken = take(board, action.id);
      return taken.card ? put(taken.board, taken.card, action.to, action.index) : board;
    }
    case "insert":
      return put(board, action.card, action.column, action.index);
    case "addPending":
      return put(board, { key: action.key, id: null, title: action.title, done: 0, total: 0 }, "todo", Infinity);
    case "addAccepted":
      return mapColumns(board, cards =>
        cards.map(card => (card.key === action.key ? { ...card, id: action.id } : card)),
      );
    case "removeKey":
      return mapColumns(board, cards => cards.filter(card => card.key !== action.key));
    case "rename":
      return mapColumns(board, cards =>
        cards.map(card => (card.id === action.id ? { ...card, title: action.title } : card)),
      );
    case "remove":
      return take(board, action.id).board;
    case "adjust":
      return mapColumns(board, cards =>
        cards.map(card =>
          card.id === action.id
            ? { ...card, done: card.done + action.dDone, total: card.total + action.dTotal }
            : card,
        ),
      );
  }
}
