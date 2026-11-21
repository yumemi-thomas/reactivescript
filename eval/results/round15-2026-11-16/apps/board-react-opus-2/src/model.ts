// Board state: what the server last told us (the base) plus the user's actions still in flight (ops).
// What the page shows is always the base with every op applied on top, in the order the user made them.
// An op that the server declines is simply dropped, so only that action is undone; an op the server accepts
// is folded into the base once every op before it has settled too, keeping the order the user saw.
import type { Card, Column, Item } from "./api.js";

export const COLUMNS: Column[] = ["todo", "doing", "done"];
export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

export type Load<T> =
  | { status: "loading"; token: number; data?: T }
  | { status: "error"; token: number; error: string; data?: T }
  | { status: "success"; token: number; data: T };

export type BoardOp =
  | { kind: "move"; opId: number; id: number; column: Column; index: number; ok: boolean }
  | { kind: "add"; opId: number; title: string; ok: boolean; result?: { id: number; title: string } }
  | { kind: "rename"; opId: number; id: number; title: string; ok: boolean }
  | { kind: "archive"; opId: number; id: number; ok: boolean };

export type ItemOp =
  | { kind: "toggle"; opId: number; cardId: number; itemId: number; done: boolean; ok: boolean }
  | { kind: "addItem"; opId: number; cardId: number; text: string; ok: boolean; result?: Item };

export type CardError = { cardId: number; message: string };

export type BoardState = {
  cols: Record<Column, Load<Card[]>>;
  ops: BoardOp[];
  /** checklist changes the server accepted, not yet reflected in a fresh fetchCards */
  adj: Record<number, { done: number; total: number }>;
  lists: Record<number, Load<Item[]>>;
  itemOps: ItemOp[];
  selected: number | null;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: CardError | null;
  itemError: CardError | null;
};

export type ViewCard = { key: string; id: number | null; title: string; done: number; total: number };
export type ViewItem = { key: string; id: number | null; text: string; done: boolean };

export function initialBoard(): BoardState {
  return {
    cols: { todo: { status: "loading", token: 0 }, doing: { status: "loading", token: 0 }, done: { status: "loading", token: 0 } },
    ops: [],
    adj: {},
    lists: {},
    itemOps: [],
    selected: null,
    moveError: null,
    addError: null,
    archiveError: null,
    renameError: null,
    itemError: null,
  };
}

export type BoardAction =
  | { type: "colStart"; column: Column; token: number }
  | { type: "colOk"; column: Column; token: number; cards: Card[] }
  | { type: "colFail"; column: Column; token: number; error: string }
  | { type: "opStart"; op: BoardOp }
  | { type: "opOk"; opId: number; result?: { id: number; title: string } }
  | { type: "opFail"; opId: number; error: string }
  | { type: "select"; id: number; token: number }
  | { type: "listStart"; cardId: number; token: number }
  | { type: "listOk"; cardId: number; token: number; items: Item[] }
  | { type: "listFail"; cardId: number; token: number; error: string }
  | { type: "itemStart"; op: ItemOp }
  | { type: "itemOk"; opId: number; result: Item | { id: number; done: boolean } }
  | { type: "itemFail"; opId: number; error: string };

// ---- applying ops -------------------------------------------------------------------------------------------

type Cols<C> = Record<Column, C[] | null>;

function locate<C extends { id: number | null }>(cols: Cols<C>, id: number): [Column, number] | null {
  for (const c of COLUMNS) {
    const list = cols[c];
    const i = list ? list.findIndex(x => x.id === id) : -1;
    if (i >= 0) return [c, i];
  }
  return null;
}

function applyBoardOp<C extends { id: number | null; title: string }>(
  cols: Cols<C>,
  op: BoardOp,
  make: (op: Extract<BoardOp, { kind: "add" }>) => C,
): Cols<C> {
  const next: Cols<C> = { todo: cols.todo && [...cols.todo], doing: cols.doing && [...cols.doing], done: cols.done && [...cols.done] };
  switch (op.kind) {
    case "move": {
      const at = locate(next, op.id);
      if (!at) return cols;
      const [card] = next[at[0]]!.splice(at[1], 1);
      const target = next[op.column];
      if (target) target.splice(Math.max(0, Math.min(op.index, target.length)), 0, card);
      return next;
    }
    case "add": {
      if (op.result && locate(next, op.result.id)) return cols;
      next.todo?.push(make(op));
      return next;
    }
    case "rename": {
      const at = locate(next, op.id);
      if (!at) return cols;
      const list = next[at[0]]!;
      list[at[1]] = { ...list[at[1]], title: op.title };
      return next;
    }
    case "archive": {
      const at = locate(next, op.id);
      if (!at) return cols;
      next[at[0]]!.splice(at[1], 1);
      return next;
    }
  }
}

function applyItemOp<I extends { id: number | null }>(items: I[], op: ItemOp, make: (op: Extract<ItemOp, { kind: "addItem" }>) => I): I[] {
  if (op.kind === "toggle") return items.map(it => (it.id === op.itemId ? { ...it, done: op.done } : it));
  if (op.result && items.some(it => it.id === op.result!.id)) return items;
  return [...items, make(op)];
}

const countItems = (items: { done: boolean }[]) => ({ done: items.filter(i => i.done).length, total: items.length });

// ---- folding settled ops into the base -----------------------------------------------------------------------

function foldBoard(state: BoardState): BoardState {
  let { cols, ops } = state;
  while (ops.length && ops[0].ok) {
    const op = ops[0];
    ops = ops.slice(1);
    const base: Cols<Card> = {
      todo: cols.todo.status === "success" ? cols.todo.data : null,
      doing: cols.doing.status === "success" ? cols.doing.data : null,
      done: cols.done.status === "success" ? cols.done.data : null,
    };
    const after = applyBoardOp(base, op, a => ({ id: a.result!.id, title: a.result!.title, done: 0, total: 0 }));
    const nextCols = { ...cols };
    for (const c of COLUMNS) {
      const col = cols[c];
      const list = after[c];
      if (col.status === "success" && list && list !== base[c]) nextCols[c] = { ...col, data: list };
    }
    cols = nextCols;
  }
  return { ...state, cols, ops };
}

function foldItems(state: BoardState): BoardState {
  let { lists, itemOps, adj } = state;
  while (itemOps.length && itemOps[0].ok) {
    const op = itemOps[0];
    itemOps = itemOps.slice(1);
    const list = lists[op.cardId];
    if (!list?.data) continue;
    const before = countItems(list.data);
    const items = applyItemOp(list.data, op, a => a.result!);
    const after = countItems(items);
    lists = { ...lists, [op.cardId]: { ...list, data: items } as Load<Item[]> };
    const prev = adj[op.cardId] ?? { done: 0, total: 0 };
    adj = { ...adj, [op.cardId]: { done: prev.done + after.done - before.done, total: prev.total + after.total - before.total } };
  }
  return { ...state, lists, itemOps, adj };
}

// ---- reducer ---------------------------------------------------------------------------------------------------

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "colStart": {
      const prev = state.cols[action.column];
      return { ...state, cols: { ...state.cols, [action.column]: { status: "loading", token: action.token, data: prev.data } } };
    }
    case "colOk": {
      if (state.cols[action.column].token !== action.token) return state;
      const adj = { ...state.adj };
      for (const c of action.cards) delete adj[c.id];
      return { ...state, adj, cols: { ...state.cols, [action.column]: { status: "success", token: action.token, data: action.cards } } };
    }
    case "colFail": {
      const prev = state.cols[action.column];
      if (prev.token !== action.token) return state;
      return { ...state, cols: { ...state.cols, [action.column]: { status: "error", token: action.token, error: action.error } } };
    }
    case "opStart": {
      const op = action.op;
      const next = { ...state, ops: [...state.ops, op] };
      if (op.kind === "move") next.moveError = null;
      if (op.kind === "add") next.addError = null;
      if (op.kind === "rename") next.renameError = null;
      if (op.kind === "archive") {
        next.archiveError = null;
        if (state.selected === op.id) {
          next.selected = null;
          next.renameError = null;
          next.itemError = null;
        }
      }
      return next;
    }
    case "opOk": {
      const ops = state.ops.map(op => {
        if (op.opId !== action.opId) return op;
        if (op.kind === "add") return { ...op, ok: true, result: action.result };
        if (op.kind === "rename" && action.result) return { ...op, ok: true, title: action.result.title };
        return { ...op, ok: true };
      });
      return foldBoard({ ...state, ops });
    }
    case "opFail": {
      const op = state.ops.find(o => o.opId === action.opId);
      if (!op) return state;
      const next = foldBoard({ ...state, ops: state.ops.filter(o => o.opId !== action.opId) });
      if (op.kind === "move") next.moveError = action.error;
      if (op.kind === "add") next.addError = action.error;
      if (op.kind === "rename") next.renameError = { cardId: op.id, message: action.error };
      if (op.kind === "archive") next.archiveError = action.error;
      return next;
    }
    case "select": {
      if (state.selected === action.id) return state;
      const prev = state.lists[action.id];
      return {
        ...state,
        selected: action.id,
        renameError: null,
        itemError: null,
        lists: { ...state.lists, [action.id]: { status: "loading", token: action.token, data: prev?.data } },
      };
    }
    case "listStart": {
      const prev = state.lists[action.cardId];
      return { ...state, lists: { ...state.lists, [action.cardId]: { status: "loading", token: action.token, data: prev?.data } } };
    }
    case "listOk": {
      const prev = state.lists[action.cardId];
      if (!prev || prev.token !== action.token) return state;
      return { ...state, lists: { ...state.lists, [action.cardId]: { status: "success", token: action.token, data: action.items } } };
    }
    case "listFail": {
      const prev = state.lists[action.cardId];
      if (!prev || prev.token !== action.token) return state;
      return { ...state, lists: { ...state.lists, [action.cardId]: { status: "error", token: action.token, error: action.error, data: prev.data } } };
    }
    case "itemStart":
      return { ...state, itemOps: [...state.itemOps, action.op], itemError: null };
    case "itemOk": {
      const r = action.result;
      const itemOps = state.itemOps.map(op => {
        if (op.opId !== action.opId) return op;
        if (op.kind === "addItem") return { ...op, ok: true, result: r as Item };
        return { ...op, ok: true, done: r.done };
      });
      return foldItems({ ...state, itemOps });
    }
    case "itemFail": {
      const op = state.itemOps.find(o => o.opId === action.opId);
      if (!op) return state;
      const next = foldItems({ ...state, itemOps: state.itemOps.filter(o => o.opId !== action.opId) });
      next.itemError = { cardId: op.cardId, message: action.error };
      return next;
    }
  }
}

// ---- what the page shows -------------------------------------------------------------------------------------

export function viewItems(state: BoardState, cardId: number): ViewItem[] | null {
  const list = state.lists[cardId];
  if (!list?.data) return null;
  let items: ViewItem[] = list.data.map(it => ({ key: `i${it.id}`, id: it.id, text: it.text, done: it.done }));
  for (const op of state.itemOps) {
    if (op.cardId !== cardId) continue;
    items = applyItemOp(items, op, a =>
      a.result
        ? { key: `n${a.opId}`, id: a.result.id, text: a.result.text, done: a.result.done }
        : { key: `n${a.opId}`, id: null, text: a.text, done: false },
    );
  }
  return items;
}

export function viewBoard(state: BoardState): Record<Column, ViewCard[]> {
  let cols: Cols<ViewCard> = { todo: null, doing: null, done: null };
  for (const c of COLUMNS) {
    const col = state.cols[c];
    if (col.status === "success") cols[c] = col.data.map(card => ({ key: `c${card.id}`, ...card }));
  }
  for (const op of state.ops) {
    cols = applyBoardOp(cols, op, a =>
      a.result
        ? { key: `a${a.opId}`, id: a.result.id, title: a.result.title, done: 0, total: 0 }
        : { key: `a${a.opId}`, id: null, title: a.title, done: 0, total: 0 },
    );
  }
  const counts = (card: ViewCard): ViewCard => {
    if (card.id === null) return card;
    let { done, total } = card;
    const adj = state.adj[card.id];
    if (adj) { done += adj.done; total += adj.total; }
    const base = state.lists[card.id]?.data;
    if (base && state.itemOps.some(op => op.cardId === card.id)) {
      const before = countItems(base);
      const after = countItems(viewItems(state, card.id) ?? base);
      done += after.done - before.done;
      total += after.total - before.total;
    }
    return done === card.done && total === card.total ? card : { ...card, done, total };
  };
  return {
    todo: (cols.todo ?? []).map(counts),
    doing: (cols.doing ?? []).map(counts),
    done: (cols.done ?? []).map(counts),
  };
}
