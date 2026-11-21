import type { Card, Column, Item } from "./api";

export const COLUMNS: Column[] = ["todo", "doing", "done"];
export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export type ColState = { status: "loading" | "error" | "ok"; error: string; cards: Card[]; req: number };

export type Op =
  | { kind: "move"; op: number; id: number; column: Column; index: number }
  | { kind: "add"; op: number; title: string }
  | { kind: "rename"; op: number; id: number; title: string }
  | { kind: "archive"; op: number; id: number }
  | { kind: "toggle"; op: number; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; op: number; cardId: number; text: string };

export type ChecklistState = {
  cardId: number;
  req: number;
  status: "loading" | "error" | "ok";
  error: string;
  items: Item[];
};

export type BoardState = {
  cols: Record<Column, ColState>;
  ops: Op[];
  /** confirmed done state of checklist items, by item id */
  itemDone: Record<number, boolean>;
  selected: number | null;
  checklist: ChecklistState | null;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: string | null;
  itemError: string | null;
};

export type BoardAction =
  | { type: "colLoading"; col: Column; req: number }
  | { type: "colLoaded"; col: Column; req: number; cards: Card[] }
  | { type: "colFailed"; col: Column; req: number; message: string }
  | { type: "select"; id: number; req: number }
  | { type: "checklistLoading"; req: number }
  | { type: "checklistLoaded"; req: number; items: Item[] }
  | { type: "checklistFailed"; req: number; message: string }
  | { type: "start"; op: Op }
  | { type: "accepted"; op: Op; result: unknown }
  | { type: "declined"; op: Op; message: string };

const emptyCol = (): ColState => ({ status: "loading", error: "", cards: [], req: 0 });

export function initialBoard(): BoardState {
  return {
    cols: { todo: emptyCol(), doing: emptyCol(), done: emptyCol() },
    ops: [],
    itemDone: {},
    selected: null,
    checklist: null,
    moveError: null,
    addError: null,
    archiveError: null,
    renameError: null,
    itemError: null,
  };
}

function updateCard(cols: Record<Column, ColState>, id: number, f: (c: Card) => Card): Record<Column, ColState> {
  const next = { ...cols };
  for (const col of COLUMNS) {
    const i = cols[col].cards.findIndex(c => c.id === id);
    if (i >= 0) {
      const cards = [...cols[col].cards];
      cards[i] = f(cards[i]);
      next[col] = { ...cols[col], cards };
    }
  }
  return next;
}

function removeCard(cols: Record<Column, ColState>, id: number): { cols: Record<Column, ColState>; card: Card | null } {
  const next = { ...cols };
  let card: Card | null = null;
  for (const col of COLUMNS) {
    const i = cols[col].cards.findIndex(c => c.id === id);
    if (i >= 0) {
      card = cols[col].cards[i];
      next[col] = { ...cols[col], cards: cols[col].cards.filter(c => c.id !== id) };
    }
  }
  return { cols: next, card };
}

function applyAccepted(state: BoardState, op: Op, result: unknown): BoardState {
  switch (op.kind) {
    case "move": {
      const { cols, card } = removeCard(state.cols, op.id);
      if (!card) return state;
      const cards = [...cols[op.column].cards];
      cards.splice(Math.min(op.index, cards.length), 0, card);
      return { ...state, cols: { ...cols, [op.column]: { ...cols[op.column], cards } } };
    }
    case "add": {
      const res = result as { id: number; title: string };
      const todo = state.cols.todo;
      if (todo.cards.some(c => c.id === res.id)) return state;
      const card: Card = { id: res.id, title: res.title ?? op.title, done: 0, total: 0 };
      return { ...state, cols: { ...state.cols, todo: { ...todo, cards: [...todo.cards, card] } } };
    }
    case "rename": {
      const res = result as { title?: string };
      const title = typeof res?.title === "string" ? res.title : op.title;
      return { ...state, cols: updateCard(state.cols, op.id, c => ({ ...c, title })) };
    }
    case "archive":
      return { ...state, cols: removeCard(state.cols, op.id).cols };
    case "toggle": {
      const before = state.itemDone[op.itemId];
      const delta = before === undefined ? 0 : (op.done ? 1 : 0) - (before ? 1 : 0);
      const cols = delta ? updateCard(state.cols, op.cardId, c => ({ ...c, done: c.done + delta })) : state.cols;
      let checklist = state.checklist;
      if (checklist && checklist.cardId === op.cardId) {
        checklist = { ...checklist, items: checklist.items.map(it => (it.id === op.itemId ? { ...it, done: op.done } : it)) };
      }
      return { ...state, cols, checklist, itemDone: { ...state.itemDone, [op.itemId]: op.done } };
    }
    case "addItem": {
      const res = result as Item;
      const item: Item = { id: res.id, text: typeof res.text === "string" ? res.text : op.text, done: !!res.done };
      const cols = updateCard(state.cols, op.cardId, c => ({ ...c, total: c.total + 1, done: c.done + (item.done ? 1 : 0) }));
      let checklist = state.checklist;
      if (checklist && checklist.cardId === op.cardId && checklist.status === "ok" && !checklist.items.some(it => it.id === item.id)) {
        checklist = { ...checklist, items: [...checklist.items, item] };
      }
      return { ...state, cols, checklist, itemDone: { ...state.itemDone, [item.id]: item.done } };
    }
  }
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "colLoading":
      return { ...state, cols: { ...state.cols, [action.col]: { status: "loading", error: "", cards: [], req: action.req } } };
    case "colLoaded": {
      if (state.cols[action.col].req !== action.req) return state;
      return { ...state, cols: { ...state.cols, [action.col]: { status: "ok", error: "", cards: action.cards, req: action.req } } };
    }
    case "colFailed": {
      if (state.cols[action.col].req !== action.req) return state;
      return { ...state, cols: { ...state.cols, [action.col]: { status: "error", error: action.message, cards: [], req: action.req } } };
    }
    case "select":
      return {
        ...state,
        selected: action.id,
        checklist: { cardId: action.id, req: action.req, status: "loading", error: "", items: [] },
        renameError: null,
        itemError: null,
      };
    case "checklistLoading": {
      if (!state.checklist) return state;
      return { ...state, checklist: { ...state.checklist, req: action.req, status: "loading", error: "", items: [] } };
    }
    case "checklistLoaded": {
      const cl = state.checklist;
      if (!cl || cl.req !== action.req) return state;
      const pending = new Set(state.ops.flatMap(o => (o.kind === "toggle" ? [o.itemId] : [])));
      const itemDone = { ...state.itemDone };
      for (const it of action.items) if (!pending.has(it.id)) itemDone[it.id] = it.done;
      const items = action.items.map(it => (pending.has(it.id) && it.id in itemDone ? { ...it, done: itemDone[it.id] } : it));
      return { ...state, itemDone, checklist: { ...cl, status: "ok", error: "", items } };
    }
    case "checklistFailed": {
      const cl = state.checklist;
      if (!cl || cl.req !== action.req) return state;
      return { ...state, checklist: { ...cl, status: "error", error: action.message, items: [] } };
    }
    case "start": {
      const op = action.op;
      const next: BoardState = { ...state, ops: [...state.ops, op] };
      switch (op.kind) {
        case "move": next.moveError = null; break;
        case "add": next.addError = null; break;
        case "rename": next.renameError = null; break;
        case "archive":
          next.archiveError = null;
          if (state.selected === op.id) { next.selected = null; next.checklist = null; next.renameError = null; next.itemError = null; }
          break;
        case "toggle":
          next.itemError = null;
          if (!(op.itemId in state.itemDone)) {
            const base = state.checklist?.items.find(it => it.id === op.itemId);
            next.itemDone = { ...state.itemDone, [op.itemId]: base ? base.done : !op.done };
          }
          break;
        case "addItem": next.itemError = null; break;
      }
      return next;
    }
    case "accepted": {
      if (!state.ops.includes(action.op)) return state;
      const without = { ...state, ops: state.ops.filter(o => o !== action.op) };
      return applyAccepted(without, action.op, action.result);
    }
    case "declined": {
      if (!state.ops.includes(action.op)) return state;
      const op = action.op;
      const next: BoardState = { ...state, ops: state.ops.filter(o => o !== op) };
      const m = action.message;
      switch (op.kind) {
        case "move": next.moveError = m; break;
        case "add": next.addError = m; break;
        case "archive": next.archiveError = m; break;
        case "rename": if (state.selected === op.id) next.renameError = m; break;
        case "toggle":
        case "addItem": if (state.selected === op.cardId) next.itemError = m; break;
      }
      return next;
    }
  }
}

export type ShownCard = { key: string; id: number | null; title: string; done: number; total: number };
export type ShownColumns = Record<Column, ShownCard[]>;

/** the board as shown: the confirmed cards with every pending change applied, in order */
export function shownColumns(state: BoardState): ShownColumns {
  const cols: ShownColumns = { todo: [], doing: [], done: [] };
  for (const col of COLUMNS) {
    cols[col] = state.cols[col].status === "ok" ? state.cols[col].cards.map(c => ({ ...c, key: `c${c.id}` })) : [];
  }
  const find = (id: number): [Column, number] | null => {
    for (const col of COLUMNS) {
      const i = cols[col].findIndex(c => c.id === id);
      if (i >= 0) return [col, i];
    }
    return null;
  };
  const lastToggle = new Map<number, { cardId: number; done: boolean }>();
  for (const op of state.ops) {
    switch (op.kind) {
      case "move": {
        const at = find(op.id);
        if (!at || state.cols[op.column].status !== "ok") break;
        const [card] = cols[at[0]].splice(at[1], 1);
        const target = cols[op.column];
        target.splice(Math.min(op.index, target.length), 0, card);
        break;
      }
      case "add":
        if (state.cols.todo.status === "ok") cols.todo.push({ key: `a${op.op}`, id: null, title: op.title, done: 0, total: 0 });
        break;
      case "rename": {
        const at = find(op.id);
        if (at) cols[at[0]][at[1]] = { ...cols[at[0]][at[1]], title: op.title };
        break;
      }
      case "archive": {
        const at = find(op.id);
        if (at) cols[at[0]].splice(at[1], 1);
        break;
      }
      case "toggle":
        lastToggle.set(op.itemId, { cardId: op.cardId, done: op.done });
        break;
      case "addItem": {
        const at = find(op.cardId);
        if (at) cols[at[0]][at[1]] = { ...cols[at[0]][at[1]], total: cols[at[0]][at[1]].total + 1 };
        break;
      }
    }
  }
  for (const [itemId, t] of lastToggle) {
    const before = state.itemDone[itemId];
    if (before === undefined) continue;
    const delta = (t.done ? 1 : 0) - (before ? 1 : 0);
    if (!delta) continue;
    const at = find(t.cardId);
    if (at) cols[at[0]][at[1]] = { ...cols[at[0]][at[1]], done: cols[at[0]][at[1]].done + delta };
  }
  return cols;
}

export type ShownItem = { key: string; id: number | null; text: string; done: boolean };

/** the selected card's checklist as shown, or null while it is not loaded */
export function shownChecklist(state: BoardState): ShownItem[] | null {
  const cl = state.checklist;
  if (!cl || cl.status !== "ok" || cl.cardId !== state.selected) return null;
  const lastToggle = new Map<number, boolean>();
  const adding: ShownItem[] = [];
  for (const op of state.ops) {
    if (op.kind === "toggle" && op.cardId === cl.cardId) lastToggle.set(op.itemId, op.done);
    if (op.kind === "addItem" && op.cardId === cl.cardId) adding.push({ key: `a${op.op}`, id: null, text: op.text, done: false });
  }
  return [
    ...cl.items.map(it => ({ key: `i${it.id}`, id: it.id, text: it.text, done: lastToggle.get(it.id) ?? it.done })),
    ...adding,
  ];
}
