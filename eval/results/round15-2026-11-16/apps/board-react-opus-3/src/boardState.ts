import type { Card, Column, Item } from "./api";
import { apply, initialData, type Data, type Fold, type Op } from "./board";

type KeyedError = { cardId: number; message: string } | null;

export type BoardState = {
  base: Data;
  ops: Op[];
  selected: number | null;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: KeyedError;
  itemError: KeyedError;
};

export type Action =
  | { type: "colLoading"; column: Column }
  | { type: "colLoaded"; column: Column; cards: Card[] }
  | { type: "colFailed"; column: Column; error: string }
  | { type: "select"; cardId: number }
  | { type: "clLoading"; cardId: number }
  | { type: "clLoaded"; cardId: number; items: Item[] }
  | { type: "clFailed"; cardId: number; error: string }
  | { type: "start"; op: Op }
  | { type: "succeed"; opId: number; fold: Fold }
  | { type: "fail"; opId: number; error: string };

export const initialBoard = (): BoardState => ({
  base: initialData(),
  ops: [],
  selected: null,
  moveError: null,
  addError: null,
  archiveError: null,
  renameError: null,
  itemError: null,
});

function withChecklist(base: Data, cardId: number, patch: Partial<Data["checklists"][number]>): Data {
  const prev = base.checklists[cardId] ?? { status: "loading", error: null, items: null };
  return { ...base, checklists: { ...base.checklists, [cardId]: { ...prev, ...patch } } };
}

export function reducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case "colLoading":
      return { ...state, base: { ...state.base, columns: { ...state.base.columns, [action.column]: { status: "loading" } } } };
    case "colLoaded":
      return {
        ...state,
        base: { ...state.base, columns: { ...state.base.columns, [action.column]: { status: "ok", cards: action.cards } } },
      };
    case "colFailed":
      return {
        ...state,
        base: { ...state.base, columns: { ...state.base.columns, [action.column]: { status: "error", error: action.error } } },
      };
    case "select":
      if (state.selected === action.cardId) return state;
      return { ...state, selected: action.cardId, renameError: null, itemError: null };
    case "clLoading":
      return { ...state, base: withChecklist(state.base, action.cardId, { status: "loading", error: null }) };
    case "clLoaded":
      return { ...state, base: withChecklist(state.base, action.cardId, { status: "ok", error: null, items: action.items }) };
    case "clFailed":
      return { ...state, base: withChecklist(state.base, action.cardId, { status: "error", error: action.error }) };
    case "start": {
      const { op } = action;
      const next = { ...state, ops: [...state.ops, op] };
      switch (op.kind) {
        case "move": return { ...next, moveError: null };
        case "addCard": return { ...next, addError: null };
        case "archive":
          return { ...next, archiveError: null, selected: state.selected === op.cardId ? null : state.selected };
        case "rename": return { ...next, renameError: null };
        case "toggle":
        case "addItem": return { ...next, itemError: null };
      }
      return next;
    }
    case "succeed": {
      if (!state.ops.some(o => o.opId === action.opId)) return state;
      return { ...state, ops: state.ops.filter(o => o.opId !== action.opId), base: apply(state.base, action.fold) };
    }
    case "fail": {
      const op = state.ops.find(o => o.opId === action.opId);
      if (!op) return state;
      const next = { ...state, ops: state.ops.filter(o => o.opId !== action.opId) };
      switch (op.kind) {
        case "move": return { ...next, moveError: action.error };
        case "addCard": return { ...next, addError: action.error };
        case "archive": return { ...next, archiveError: action.error };
        case "rename": return { ...next, renameError: { cardId: op.cardId, message: action.error } };
        case "toggle":
        case "addItem": return { ...next, itemError: { cardId: op.cardId, message: action.error } };
      }
      return next;
    }
  }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
