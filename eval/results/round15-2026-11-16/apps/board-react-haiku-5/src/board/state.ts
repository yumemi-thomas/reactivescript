import type { Card as ApiCard, Column, Item as ApiItem } from "../api.js";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;
export const DIRS = ["left", "right", "up", "down"] as const;
export type Dir = (typeof DIRS)[number];

/** A card on the board. `id` is null while the server has not yet answered an add. */
export type BoardCard = { uid: string; id: number | null; title: string; done: number; total: number };
export type ChecklistItem = { uid: string; id: number | null; text: string; done: boolean };
export type Cards = Record<Column, BoardCard[]>;
export type Located = { column: Column; index: number; card: BoardCard };

export type LoadState = { req: number; status: "loading" | "ready" | "error"; message: string };
export type Checklist =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: ChecklistItem[] };

export type MovePlan = { uid: string; id: number; from: Column; fromIndex: number; to: Column; toIndex: number };
export type ArchivePlan = { card: BoardCard; column: Column; index: number };

export type BoardState = {
  load: Record<Column, LoadState>;
  cards: Cards;
  selectedId: number | null;
  checklist: Checklist | null;
  moveError: string | null;
  addError: string | null;
  archiveError: string | null;
  renameError: string | null;
  itemError: string | null;
};

export type Action =
  | { type: "load/start"; column: Column; req: number }
  | { type: "load/ok"; column: Column; req: number; cards: ApiCard[] }
  | { type: "load/err"; column: Column; req: number; message: string }
  | { type: "select"; id: number }
  | { type: "move/start"; plan: MovePlan }
  | { type: "move/revert"; plan: MovePlan; message: string }
  | { type: "add/start"; uid: string; title: string }
  | { type: "add/ok"; uid: string; card: { id: number; title: string } }
  | { type: "add/err"; uid: string; message: string }
  | { type: "rename/start"; id: number; title: string }
  | { type: "rename/revert"; id: number; previous: string; message: string }
  | { type: "archive/start"; plan: ArchivePlan }
  | { type: "archive/revert"; plan: ArchivePlan; message: string }
  | { type: "checklist/ok"; cardId: number; items: ApiItem[] }
  | { type: "checklist/err"; cardId: number; message: string }
  | { type: "toggle/start"; cardId: number; itemId: number; value: boolean }
  | { type: "toggle/revert"; cardId: number; itemId: number; value: boolean; message: string }
  | { type: "item-add/start"; cardId: number; uid: string; text: string }
  | { type: "item-add/ok"; cardId: number; uid: string; item: ApiItem }
  | { type: "item-add/err"; cardId: number; uid: string; message: string };

const START: LoadState = { req: 0, status: "loading", message: "" };

export const initialBoard: BoardState = {
  load: { todo: START, doing: START, done: START },
  cards: { todo: [], doing: [], done: [] },
  selectedId: null,
  checklist: null,
  moveError: null,
  addError: null,
  archiveError: null,
  renameError: null,
  itemError: null,
};

let reqSeq = 0;
/** A fresh request number, for telling a column's current load from a stale one. */
export function nextReq(): number {
  reqSeq += 1;
  return reqSeq;
}

let uidSeq = 0;
/** A key for a card or item the page created before the server answered. */
export function nextUid(): string {
  uidSeq += 1;
  return `new-${uidSeq}`;
}

export function toBoardCard(c: ApiCard): BoardCard {
  return { uid: `card-${c.id}`, id: c.id, title: c.title, done: c.done, total: c.total };
}

function toItem(i: ApiItem): ChecklistItem {
  return { uid: `item-${i.id}`, id: i.id, text: i.text, done: i.done };
}

export function locate(cards: Cards, pred: (c: BoardCard) => boolean): Located | null {
  for (const column of COLUMNS) {
    const index = cards[column].findIndex(pred);
    if (index !== -1) return { column, index, card: cards[column][index] };
  }
  return null;
}

export function locateById(cards: Cards, id: number): Located | null {
  return locate(cards, c => c.id === id);
}

/** Where a move button leads from `column`/`index`, or null when there is nowhere to go. */
export function targetOf(cards: Cards, column: Column, index: number, dir: Dir): { to: Column; toIndex: number } | null {
  if (dir === "left" || dir === "right") {
    const at = COLUMNS.indexOf(column) + (dir === "left" ? -1 : 1);
    if (at < 0 || at >= COLUMNS.length) return null;
    const to = COLUMNS[at];
    return { to, toIndex: cards[to].length };
  }
  const toIndex = index + (dir === "up" ? -1 : 1);
  if (toIndex < 0 || toIndex >= cards[column].length) return null;
  return { to: column, toIndex };
}

function removeUid(cards: Cards, uid: string): Cards {
  return {
    todo: cards.todo.filter(c => c.uid !== uid),
    doing: cards.doing.filter(c => c.uid !== uid),
    done: cards.done.filter(c => c.uid !== uid),
  };
}

function insertInto(cards: Cards, column: Column, index: number, card: BoardCard): Cards {
  const list = [...cards[column]];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, card);
  return { ...cards, [column]: list };
}

function relocate(cards: Cards, uid: string, to: Column, index: number): Cards {
  const found = locate(cards, c => c.uid === uid);
  if (found === null) return cards;
  return insertInto(removeUid(cards, uid), to, index, found.card);
}

function updateCards(cards: Cards, pred: (c: BoardCard) => boolean, f: (c: BoardCard) => BoardCard): Cards {
  return {
    todo: cards.todo.map(c => (pred(c) ? f(c) : c)),
    doing: cards.doing.map(c => (pred(c) ? f(c) : c)),
    done: cards.done.map(c => (pred(c) ? f(c) : c)),
  };
}

/** Changes the checklist only when it is loaded and belongs to the selected card. */
function withItems(s: BoardState, cardId: number, f: (items: ChecklistItem[]) => ChecklistItem[]): BoardState {
  const cl = s.checklist;
  if (s.selectedId !== cardId || cl === null || cl.status !== "ready") return s;
  return { ...s, checklist: { status: "ready", items: f(cl.items) } };
}

/** Flips an item and the card's done count on the board, whether or not the card is still selected. */
function applyToggle(s: BoardState, cardId: number, itemId: number, value: boolean): BoardState {
  const next = withItems(s, cardId, items => items.map(i => (i.id === itemId ? { ...i, done: value } : i)));
  const delta = value ? 1 : -1;
  return { ...next, cards: updateCards(next.cards, c => c.id === cardId, c => ({ ...c, done: c.done + delta })) };
}

export function boardReducer(s: BoardState, a: Action): BoardState {
  switch (a.type) {
    case "load/start":
      return { ...s, load: { ...s.load, [a.column]: { req: a.req, status: "loading", message: "" } } };
    case "load/ok":
      if (s.load[a.column].req !== a.req) return s;
      return {
        ...s,
        load: { ...s.load, [a.column]: { req: a.req, status: "ready", message: "" } },
        cards: { ...s.cards, [a.column]: a.cards.map(toBoardCard) },
      };
    case "load/err":
      if (s.load[a.column].req !== a.req) return s;
      return { ...s, load: { ...s.load, [a.column]: { req: a.req, status: "error", message: a.message } } };

    case "select":
      if (a.id === s.selectedId) return s;
      return { ...s, selectedId: a.id, checklist: { status: "loading" }, renameError: null, itemError: null };

    case "move/start":
      return { ...s, cards: relocate(s.cards, a.plan.uid, a.plan.to, a.plan.toIndex), moveError: null };
    case "move/revert":
      return { ...s, cards: relocate(s.cards, a.plan.uid, a.plan.from, a.plan.fromIndex), moveError: a.message };

    case "add/start":
      return {
        ...s,
        cards: insertInto(s.cards, "todo", s.cards.todo.length, { uid: a.uid, id: null, title: a.title, done: 0, total: 0 }),
        addError: null,
      };
    case "add/ok":
      return {
        ...s,
        cards: updateCards(s.cards, c => c.uid === a.uid, c => ({ ...c, id: a.card.id, title: a.card.title })),
      };
    case "add/err":
      return { ...s, cards: removeUid(s.cards, a.uid), addError: a.message };

    case "rename/start":
      return {
        ...s,
        cards: updateCards(s.cards, c => c.id === a.id, c => ({ ...c, title: a.title })),
        renameError: null,
      };
    case "rename/revert":
      return {
        ...s,
        cards: updateCards(s.cards, c => c.id === a.id, c => ({ ...c, title: a.previous })),
        renameError: s.selectedId === a.id ? a.message : s.renameError,
      };

    case "archive/start":
      return {
        ...s,
        cards: removeUid(s.cards, a.plan.card.uid),
        selectedId: null,
        checklist: null,
        renameError: null,
        itemError: null,
        archiveError: null,
      };
    case "archive/revert":
      return { ...s, cards: insertInto(s.cards, a.plan.column, a.plan.index, a.plan.card), archiveError: a.message };

    case "checklist/ok":
      return s.selectedId === a.cardId ? { ...s, checklist: { status: "ready", items: a.items.map(toItem) } } : s;
    case "checklist/err":
      return s.selectedId === a.cardId ? { ...s, checklist: { status: "error", message: a.message } } : s;

    case "toggle/start":
      return applyToggle(s, a.cardId, a.itemId, a.value);
    case "toggle/revert":
      return {
        ...applyToggle(s, a.cardId, a.itemId, a.value),
        itemError: s.selectedId === a.cardId ? a.message : s.itemError,
      };

    case "item-add/start": {
      const next = withItems(s, a.cardId, items => [...items, { uid: a.uid, id: null, text: a.text, done: false }]);
      if (next === s) return s;
      return {
        ...next,
        cards: updateCards(next.cards, c => c.id === a.cardId, c => ({ ...c, total: c.total + 1 })),
        itemError: null,
      };
    }
    case "item-add/ok":
      return withItems(s, a.cardId, items =>
        items.map(i => (i.uid === a.uid ? { uid: i.uid, id: a.item.id, text: a.item.text, done: a.item.done } : i)),
      );
    case "item-add/err": {
      const next = withItems(s, a.cardId, items => items.filter(i => i.uid !== a.uid));
      return {
        ...next,
        cards: updateCards(next.cards, c => c.id === a.cardId, c => ({ ...c, total: c.total - 1 })),
        itemError: s.selectedId === a.cardId ? a.message : s.itemError,
      };
    }
  }
}
