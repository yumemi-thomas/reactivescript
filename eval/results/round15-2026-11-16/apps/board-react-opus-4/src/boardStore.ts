import * as api from "./api.js";
import type { Card, Column, Item } from "./api.js";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

export type BoardCard = Card & { temp?: boolean };
export type ChecklistItem = Item & { temp?: boolean };
type Status = "loading" | "error" | "ok";

type ColBase = { status: Status; error: string; cards: BoardCard[] };

type Op =
  | { kind: "move"; opId: number; id: number; column: Column; index: number }
  | { kind: "add"; opId: number; tempId: number; title: string }
  | { kind: "rename"; opId: number; id: number; title: string }
  | { kind: "archive"; opId: number; id: number }
  | { kind: "toggle"; opId: number; cardId: number; itemId: number; done: boolean }
  | { kind: "addItem"; opId: number; cardId: number; tempId: number; text: string };

type CardError = { cardId: number; message: string } | null;

type State = {
  cols: Record<Column, ColBase>;
  checklists: Record<number, ChecklistItem[]>;
  checklist: { cardId: number; status: Status; error: string } | null;
  ops: Op[];
  selectedId: number | null;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: CardError;
  itemError: CardError;
};

export type ColumnView = { status: Status; error: string; cards: BoardCard[] };
export type BoardView = {
  cols: Record<Column, ColumnView>;
  selected: { card: BoardCard; column: Column } | null;
  checklist: { status: Status; error: string; items: ChecklistItem[] } | null;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: string | null;
  itemError: string | null;
};

type Working = { cols: Record<Column, BoardCard[]>; lists: Record<number, ChecklistItem[]> };

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function copyWorking(cols: Record<Column, { cards: BoardCard[] }>, lists: Record<number, ChecklistItem[]>): Working {
  const wc = {} as Record<Column, BoardCard[]>;
  for (const c of COLUMNS) wc[c] = cols[c].cards.map(card => ({ ...card }));
  const wl: Record<number, ChecklistItem[]> = {};
  for (const [k, v] of Object.entries(lists)) wl[Number(k)] = v.map(i => ({ ...i }));
  return { cols: wc, lists: wl };
}

function locate(cols: Record<Column, BoardCard[]>, id: number): { column: Column; index: number } | null {
  for (const column of COLUMNS) {
    const index = cols[column].findIndex(c => c.id === id);
    if (index >= 0) return { column, index };
  }
  return null;
}

function findCard(cols: Record<Column, BoardCard[]>, id: number): BoardCard | undefined {
  const at = locate(cols, id);
  return at ? cols[at.column][at.index] : undefined;
}

/** Applies an operation to a working copy (mutates it). */
function applyOp(w: Working, op: Op): void {
  switch (op.kind) {
    case "move": {
      const at = locate(w.cols, op.id);
      if (!at) return;
      const [card] = w.cols[at.column].splice(at.index, 1);
      const target = w.cols[op.column];
      target.splice(Math.max(0, Math.min(op.index, target.length)), 0, card);
      return;
    }
    case "add":
      w.cols.todo.push({ id: op.tempId, title: op.title, done: 0, total: 0, temp: true });
      return;
    case "rename": {
      const card = findCard(w.cols, op.id);
      if (card) card.title = op.title;
      return;
    }
    case "archive": {
      const at = locate(w.cols, op.id);
      if (at) w.cols[at.column].splice(at.index, 1);
      return;
    }
    case "toggle": {
      const card = findCard(w.cols, op.cardId);
      const item = w.lists[op.cardId]?.find(i => i.id === op.itemId);
      if (item) {
        if (item.done === op.done) return;
        item.done = op.done;
      }
      if (card) card.done = Math.max(0, Math.min(card.total, card.done + (op.done ? 1 : -1)));
      return;
    }
    case "addItem": {
      w.lists[op.cardId]?.push({ id: op.tempId, text: op.text, done: false, temp: true });
      const card = findCard(w.cols, op.cardId);
      if (card) card.total += 1;
      return;
    }
  }
}

export class BoardStore {
  private state: State = {
    cols: {
      todo: { status: "loading", error: "", cards: [] },
      doing: { status: "loading", error: "", cards: [] },
      done: { status: "loading", error: "", cards: [] },
    },
    checklists: {},
    checklist: null,
    ops: [],
    selectedId: null,
    moveError: null,
    addError: null,
    archiveError: null,
    renameError: null,
    itemError: null,
  };
  private view: BoardView = this.derive();
  private listeners = new Set<() => void>();
  private started = false;
  private seq = 0;
  private colReq: Record<Column, number> = { todo: 0, doing: 0, done: 0 };
  private checklistReq = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getSnapshot = () => this.view;

  private set(update: (s: State) => State) {
    this.state = update(this.state);
    this.view = this.derive();
    for (const fn of this.listeners) fn();
  }

  private derive(): BoardView {
    const s = this.state;
    const w = copyWorking(s.cols, s.checklists);
    for (const op of s.ops) applyOp(w, op);
    const cols = {} as Record<Column, ColumnView>;
    for (const c of COLUMNS) cols[c] = { status: s.cols[c].status, error: s.cols[c].error, cards: w.cols[c] };
    let selected: BoardView["selected"] = null;
    if (s.selectedId !== null) {
      const at = locate(w.cols, s.selectedId);
      if (at) selected = { card: w.cols[at.column][at.index], column: at.column };
    }
    const cl = s.checklist;
    const checklist = selected && cl && cl.cardId === selected.card.id
      ? { status: cl.status, error: cl.error, items: w.lists[cl.cardId] ?? [] }
      : null;
    const forSelected = (e: CardError) => (e && e.cardId === s.selectedId ? e.message : null);
    return {
      cols,
      selected,
      checklist,
      moveError: s.moveError,
      addError: s.addError,
      archiveError: s.archiveError,
      renameError: forSelected(s.renameError),
      itemError: forSelected(s.itemError),
    };
  }

  /** Removes a finished op and, when it succeeded, folds its effect into the confirmed state. */
  private settle(opId: number, confirm: ((s: State) => State) | null, extra?: Partial<State>) {
    this.set(s => {
      const next = { ...s, ops: s.ops.filter(o => o.opId !== opId), ...extra };
      return confirm ? confirm(next) : next;
    });
  }

  private confirmOp(op: Op) {
    return (s: State): State => {
      const w = copyWorking(s.cols, s.checklists);
      applyOp(w, op);
      return this.withWorking(s, w);
    };
  }

  private withWorking(s: State, w: Working): State {
    const cols = { ...s.cols };
    for (const c of COLUMNS) cols[c] = { ...cols[c], cards: w.cols[c] };
    return { ...s, cols, checklists: w.lists };
  }

  start() {
    if (this.started) return;
    this.started = true;
    for (const c of COLUMNS) this.loadColumn(c);
  }

  loadColumn(column: Column) {
    const req = ++this.colReq[column];
    this.set(s => ({ ...s, cols: { ...s.cols, [column]: { ...s.cols[column], status: "loading", error: "" } } }));
    api.fetchCards(column).then(
      cards => {
        if (req !== this.colReq[column]) return;
        this.set(s => ({ ...s, cols: { ...s.cols, [column]: { status: "ok", error: "", cards } } }));
      },
      (e: unknown) => {
        if (req !== this.colReq[column]) return;
        this.set(s => ({ ...s, cols: { ...s.cols, [column]: { ...s.cols[column], status: "error", error: errorMessage(e) } } }));
      },
    );
  }

  select(id: number) {
    if (this.state.selectedId === id) return;
    const card = COLUMNS.flatMap(c => this.view.cols[c].cards).find(c => c.id === id);
    if (!card || card.temp) return;
    const req = ++this.checklistReq;
    this.set(s => ({ ...s, selectedId: id, checklist: { cardId: id, status: "loading", error: "" }, renameError: null, itemError: null }));
    api.fetchChecklist(id).then(
      items => {
        if (req !== this.checklistReq) return;
        this.set(s => ({ ...s, checklists: { ...s.checklists, [id]: items }, checklist: { cardId: id, status: "ok", error: "" } }));
      },
      (e: unknown) => {
        if (req !== this.checklistReq) return;
        this.set(s => ({ ...s, checklist: { cardId: id, status: "error", error: errorMessage(e) } }));
      },
    );
  }

  /** Where a move button would send the card, or null if it has nowhere to go / is not allowed now. */
  moveTarget(id: number, dir: "left" | "right" | "up" | "down"): { column: Column; index: number } | null {
    const cols = this.view.cols;
    let at: { column: Column; index: number } | null = null;
    for (const c of COLUMNS) {
      const i = cols[c].cards.findIndex(card => card.id === id);
      if (i >= 0) at = { column: c, index: i };
    }
    if (!at || cols[at.column].status !== "ok") return null;
    const list = cols[at.column].cards;
    if (dir === "up") return at.index > 0 ? { column: at.column, index: at.index - 1 } : null;
    if (dir === "down") return at.index < list.length - 1 ? { column: at.column, index: at.index + 1 } : null;
    const ci = COLUMNS.indexOf(at.column) + (dir === "left" ? -1 : 1);
    if (ci < 0 || ci >= COLUMNS.length) return null;
    const column = COLUMNS[ci];
    if (cols[column].status !== "ok") return null;
    if (column === "doing" && cols.doing.cards.length >= WIP_LIMIT) return null;
    return { column, index: cols[column].cards.length };
  }

  move(id: number, dir: "left" | "right" | "up" | "down") {
    const target = this.moveTarget(id, dir);
    if (!target) return;
    const op: Op = { kind: "move", opId: ++this.seq, id, column: target.column, index: target.index };
    this.set(s => ({ ...s, moveError: null, ops: [...s.ops, op] }));
    api.moveCard(id, target.column, target.index).then(
      () => this.settle(op.opId, this.confirmOp(op)),
      (e: unknown) => this.settle(op.opId, null, { moveError: errorMessage(e) }),
    );
  }

  addCard(title: string) {
    const op: Op = { kind: "add", opId: ++this.seq, tempId: -++this.seq, title };
    this.set(s => ({ ...s, addError: null, ops: [...s.ops, op] }));
    api.addCard("todo", title).then(
      res => this.settle(op.opId, s => {
        const w = copyWorking(s.cols, s.checklists);
        if (!locate(w.cols, res.id)) w.cols.todo.push({ id: res.id, title: res.title, done: 0, total: 0 });
        return this.withWorking(s, w);
      }),
      (e: unknown) => this.settle(op.opId, null, { addError: errorMessage(e) }),
    );
  }

  rename(title: string) {
    const id = this.view.selected?.card.id;
    if (id === undefined) return;
    const op: Op = { kind: "rename", opId: ++this.seq, id, title };
    this.set(s => ({ ...s, renameError: null, ops: [...s.ops, op] }));
    api.renameCard(id, title).then(
      res => this.settle(op.opId, this.confirmOp({ ...op, title: typeof res?.title === "string" ? res.title : title })),
      (e: unknown) => this.settle(op.opId, null, { renameError: { cardId: id, message: errorMessage(e) } }),
    );
  }

  archive() {
    const id = this.view.selected?.card.id;
    if (id === undefined) return;
    const op: Op = { kind: "archive", opId: ++this.seq, id };
    this.checklistReq++;
    this.set(s => ({
      ...s, selectedId: null, checklist: null, renameError: null, itemError: null, archiveError: null, ops: [...s.ops, op],
    }));
    api.archiveCard(id).then(
      () => this.settle(op.opId, this.confirmOp(op)),
      (e: unknown) => this.settle(op.opId, null, { archiveError: errorMessage(e) }),
    );
  }

  toggle(itemId: number) {
    const sel = this.view.selected;
    const item = this.view.checklist?.items.find(i => i.id === itemId);
    if (!sel || !item || item.temp) return;
    const cardId = sel.card.id;
    const done = !item.done;
    const op: Op = { kind: "toggle", opId: ++this.seq, cardId, itemId, done };
    this.set(s => ({ ...s, itemError: null, ops: [...s.ops, op] }));
    api.toggleItem(cardId, itemId, done).then(
      () => this.settle(op.opId, this.confirmOp(op)),
      (e: unknown) => this.settle(op.opId, null, { itemError: { cardId, message: errorMessage(e) } }),
    );
  }

  addItem(text: string) {
    const sel = this.view.selected;
    if (!sel || this.view.checklist?.status !== "ok") return;
    const cardId = sel.card.id;
    const op: Op = { kind: "addItem", opId: ++this.seq, cardId, tempId: -++this.seq, text };
    this.set(s => ({ ...s, itemError: null, ops: [...s.ops, op] }));
    api.addItem(cardId, text).then(
      res => this.settle(op.opId, s => {
        const w = copyWorking(s.cols, s.checklists);
        const list = w.lists[cardId];
        const known = list?.some(i => i.id === res.id) ?? false;
        if (list && !known) list.push({ id: res.id, text: res.text, done: res.done });
        const card = findCard(w.cols, cardId);
        if (card && !known) { card.total += 1; if (res.done) card.done += 1; }
        return this.withWorking(s, w);
      }),
      (e: unknown) => this.settle(op.opId, null, { itemError: { cardId, message: errorMessage(e) } }),
    );
  }
}
