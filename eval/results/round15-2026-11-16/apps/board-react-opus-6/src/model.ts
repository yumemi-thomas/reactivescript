import type { Card, Column, Item } from "./api.js";

export const COLUMNS: Column[] = ["todo", "doing", "done"];
export const COLUMN_NAME: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

let counter = 1;
/** a process-wide unique number, for request and operation ids */
export const uid = () => counter++;

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** a card as the board holds it; `id` is null while an add is unanswered */
export type BoardCard = { key: string; id: number | null; title: string; done: number; total: number };
/** a checklist item; `id` is null while an add is unanswered */
export type ChecklistItem = { key: string; id: number | null; text: string; done: boolean };

export type ColumnState =
  | { status: "loading"; req: number }
  | { status: "error"; req: number; message: string }
  | { status: "ok"; req: number; cards: BoardCard[] };

export type ChecklistState =
  | { cardId: number; req: number; status: "loading" }
  | { cardId: number; req: number; status: "error"; message: string }
  | { cardId: number; req: number; status: "ok"; items: ChecklistItem[] };

export type OpBody =
  | { kind: "move"; id: number; to: Column; index: number }
  | { kind: "rename"; id: number; title: string }
  | { kind: "add"; title: string; newId: number | null }
  | { kind: "archive"; id: number }
  | { kind: "toggle"; cardId: number; itemId: number; done: boolean; delta: number }
  | { kind: "addItem"; cardId: number; text: string; newItem: Item | null };

/** an optimistic change; confirmed ones are folded into the base once every earlier one has settled */
export type Op = OpBody & { opId: number; confirmed: boolean };

type CardLists = Record<Column, BoardCard[] | null>;

export type CardError = { cardId: number; message: string } | null;

export type BoardState = {
  columns: Record<Column, ColumnState>;
  ops: Op[];
  selected: number | null;
  checklist: ChecklistState | null;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: CardError;
  itemError: CardError;
};

export const initialBoard = (): BoardState => ({
  columns: { todo: { status: "loading", req: 0 }, doing: { status: "loading", req: 0 }, done: { status: "loading", req: 0 } },
  ops: [],
  selected: null,
  checklist: null,
  moveError: null,
  addError: null,
  archiveError: null,
  renameError: null,
  itemError: null,
});

function findCard(lists: CardLists, id: number): [Column, number] | null {
  for (const col of COLUMNS) {
    const i = lists[col]?.findIndex(c => c.id === id) ?? -1;
    if (i >= 0) return [col, i];
  }
  return null;
}

function mapCard(lists: CardLists, id: number, f: (c: BoardCard) => BoardCard): CardLists {
  const at = findCard(lists, id);
  if (!at) return lists;
  const [col, i] = at;
  const cards = [...(lists[col] as BoardCard[])];
  cards[i] = f(cards[i]);
  return { ...lists, [col]: cards };
}

export function applyToCards(lists: CardLists, op: Op): CardLists {
  switch (op.kind) {
    case "move": {
      const at = findCard(lists, op.id);
      const target = lists[op.to];
      if (!at || !target) return lists;
      const [from, i] = at;
      const card = (lists[from] as BoardCard[])[i];
      const next = { ...lists, [from]: (lists[from] as BoardCard[]).filter((_, j) => j !== i) };
      const dest = [...(next[op.to] as BoardCard[])];
      dest.splice(Math.max(0, Math.min(op.index, dest.length)), 0, card);
      return { ...next, [op.to]: dest };
    }
    case "rename":
      return mapCard(lists, op.id, c => ({ ...c, title: op.title }));
    case "add": {
      const todo = lists.todo;
      if (!todo) return lists;
      if (op.newId !== null && findCard(lists, op.newId)) return lists;
      return { ...lists, todo: [...todo, { key: `a${op.opId}`, id: op.newId, title: op.title, done: 0, total: 0 }] };
    }
    case "archive": {
      const at = findCard(lists, op.id);
      if (!at) return lists;
      const [col, i] = at;
      return { ...lists, [col]: (lists[col] as BoardCard[]).filter((_, j) => j !== i) };
    }
    case "toggle":
      return mapCard(lists, op.cardId, c => ({ ...c, done: Math.max(0, Math.min(c.total, c.done + op.delta)) }));
    case "addItem":
      return mapCard(lists, op.cardId, c => ({ ...c, total: c.total + 1 }));
  }
}

export function applyToItems(cardId: number, items: ChecklistItem[], op: Op): ChecklistItem[] {
  if (op.kind === "toggle" && op.cardId === cardId) {
    return items.map(it => (it.id === op.itemId ? { ...it, done: op.done } : it));
  }
  if (op.kind === "addItem" && op.cardId === cardId) {
    const item = op.newItem;
    if (item && items.some(it => it.id === item.id)) return items;
    return [...items, { key: `i${op.opId}`, id: item?.id ?? null, text: item?.text ?? op.text, done: item?.done ?? false }];
  }
  return items;
}

const listsOf = (columns: Record<Column, ColumnState>): CardLists => ({
  todo: columns.todo.status === "ok" ? columns.todo.cards : null,
  doing: columns.doing.status === "ok" ? columns.doing.cards : null,
  done: columns.done.status === "ok" ? columns.done.cards : null,
});

/** what the board shows: the server's state with every unsettled change laid over it */
export function displayed(state: BoardState): { lists: CardLists; items: ChecklistItem[] | null } {
  let lists = listsOf(state.columns);
  const cl = state.checklist;
  let items = cl && cl.status === "ok" ? cl.items : null;
  for (const op of state.ops) {
    lists = applyToCards(lists, op);
    if (items && cl) items = applyToItems(cl.cardId, items, op);
  }
  return { lists, items };
}

/** fold confirmed changes at the head of the queue into the base */
function compact(state: BoardState): BoardState {
  let { columns, checklist } = state;
  let n = 0;
  while (n < state.ops.length && state.ops[n].confirmed) {
    const op = state.ops[n];
    const lists = applyToCards(listsOf(columns), op);
    const next = { ...columns };
    for (const col of COLUMNS) {
      const cs = columns[col];
      const cards = lists[col];
      if (cs.status === "ok" && cards && cards !== cs.cards) next[col] = { ...cs, cards };
    }
    columns = next;
    if (checklist && checklist.status === "ok") {
      const items = applyToItems(checklist.cardId, checklist.items, op);
      if (items !== checklist.items) checklist = { ...checklist, items };
    }
    n++;
  }
  if (n === 0) return state;
  return { ...state, columns, checklist, ops: state.ops.slice(n) };
}

export type BoardAction =
  | { type: "colStart"; col: Column; req: number }
  | { type: "colOk"; col: Column; req: number; cards: Card[] }
  | { type: "colErr"; col: Column; req: number; message: string }
  | { type: "opStart"; op: Op }
  | { type: "opOk"; opId: number; patch: Partial<OpBody> }
  | { type: "opFail"; opId: number; message: string }
  | { type: "select"; id: number; req: number }
  | { type: "clOk"; req: number; items: Item[] }
  | { type: "clErr"; req: number; message: string };

export function boardReducer(state: BoardState, a: BoardAction): BoardState {
  switch (a.type) {
    case "colStart":
      return { ...state, columns: { ...state.columns, [a.col]: { status: "loading", req: a.req } } };
    case "colOk": {
      const cs = state.columns[a.col];
      if (cs.status !== "loading" || cs.req !== a.req) return state;
      const cards = a.cards.map(c => ({ key: `c${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total }));
      return { ...state, columns: { ...state.columns, [a.col]: { status: "ok", req: a.req, cards } } };
    }
    case "colErr": {
      const cs = state.columns[a.col];
      if (cs.status !== "loading" || cs.req !== a.req) return state;
      return { ...state, columns: { ...state.columns, [a.col]: { status: "error", req: a.req, message: a.message } } };
    }
    case "opStart": {
      const op = a.op;
      const next: BoardState = { ...state, ops: [...state.ops, op] };
      switch (op.kind) {
        case "move": next.moveError = null; break;
        case "add": next.addError = null; break;
        case "archive":
          next.archiveError = null;
          if (state.selected === op.id) {
            next.selected = null; next.checklist = null; next.renameError = null; next.itemError = null;
          }
          break;
        case "rename": next.renameError = null; break;
        case "toggle": case "addItem": next.itemError = null; break;
      }
      return next;
    }
    case "opOk": {
      if (!state.ops.some(o => o.opId === a.opId)) return state;
      const ops = state.ops.map(o => (o.opId === a.opId ? ({ ...o, ...a.patch, confirmed: true } as Op) : o));
      return compact({ ...state, ops });
    }
    case "opFail": {
      const op = state.ops.find(o => o.opId === a.opId);
      if (!op) return state;
      const next: BoardState = { ...state, ops: state.ops.filter(o => o.opId !== a.opId) };
      switch (op.kind) {
        case "move": next.moveError = a.message; break;
        case "add": next.addError = a.message; break;
        case "archive": next.archiveError = a.message; break;
        case "rename":
          if (state.selected === op.id) next.renameError = { cardId: op.id, message: a.message };
          break;
        case "toggle": case "addItem":
          if (state.selected === op.cardId) next.itemError = { cardId: op.cardId, message: a.message };
          break;
      }
      return compact(next);
    }
    case "select":
      if (state.selected === a.id) return state;
      return {
        ...state, selected: a.id, checklist: { cardId: a.id, req: a.req, status: "loading" }, renameError: null, itemError: null,
      };
    case "clOk": {
      const cl = state.checklist;
      if (!cl || cl.req !== a.req || cl.status !== "loading") return state;
      const items = a.items.map(it => ({ key: `s${it.id}`, id: it.id, text: it.text, done: it.done }));
      return { ...state, checklist: { cardId: cl.cardId, req: cl.req, status: "ok", items } };
    }
    case "clErr": {
      const cl = state.checklist;
      if (!cl || cl.req !== a.req || cl.status !== "loading") return state;
      return { ...state, checklist: { cardId: cl.cardId, req: cl.req, status: "error", message: a.message } };
    }
  }
}
