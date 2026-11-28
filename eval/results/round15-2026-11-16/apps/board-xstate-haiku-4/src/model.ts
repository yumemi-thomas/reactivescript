import type { Card, Item } from "./api";

export type Column = "todo" | "doing" | "done";
export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAME: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };

/** Doing holds at most this many cards (counting moves the server has not answered yet). */
export const WIP_LIMIT = 3;

export type Place = { column: Column; index: number };
export type MoveDir = "left" | "right" | "up" | "down";

/** A card as the board shows it. `id` is null while the server has not yet answered an add. */
export type CardView = { key: string; id: number | null; title: string; done: number; total: number };
/** A checklist row. `id` is null while the server has not yet answered an add. */
export type ItemView = { key: string; id: number | null; text: string; done: boolean };
export type ColumnView = { status: "loading" | "loaded" | "failed"; cards: CardView[]; error: string | null };
export type Columns = Record<Column, ColumnView>;

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toCardView(card: Card): CardView {
  return { key: `card-${card.id}`, id: card.id, title: card.title, done: card.done, total: card.total };
}

export function toItemView(item: Item): ItemView {
  return { key: `item-${item.id}`, id: item.id, text: item.text, done: item.done };
}

export function findCard(columns: Columns, id: number): (Place & { card: CardView }) | null {
  for (const column of COLUMNS) {
    const cards = columns[column].cards;
    const index = cards.findIndex((card) => card.id === id);
    if (index >= 0) return { column, index, card: cards[index] };
  }
  return null;
}

export function setColumn(columns: Columns, column: Column, view: ColumnView): Columns {
  return { ...columns, [column]: view };
}

export function withCards(columns: Columns, column: Column, cards: CardView[]): Columns {
  return setColumn(columns, column, { ...columns[column], cards });
}

/** Maps every card on the board; returning null drops the card. */
export function mapCards(columns: Columns, fn: (card: CardView) => CardView | null): Columns {
  const next = { ...columns };
  for (const column of COLUMNS) {
    const cards: CardView[] = [];
    for (const card of columns[column].cards) {
      const mapped = fn(card);
      if (mapped) cards.push(mapped);
    }
    next[column] = { ...columns[column], cards };
  }
  return next;
}

export function insertCard(columns: Columns, card: CardView, place: Place): Columns {
  const cards = [...columns[place.column].cards];
  cards.splice(place.index, 0, card);
  return withCards(columns, place.column, cards);
}

/** Takes the card with `id` out of its column and puts it at `to` (a position in the columns as they are after the take-out). */
export function relocateCard(columns: Columns, id: number, to: Place): Columns {
  const found = findCard(columns, id);
  if (!found) return columns;
  const removed = mapCards(columns, (card) => (card.id === id ? null : card));
  return insertCard(removed, found.card, to);
}

export function canEnter(columns: Columns, column: Column): boolean {
  if (columns[column].status !== "loaded") return false;
  return column !== "doing" || columns.doing.cards.length < WIP_LIMIT;
}

/**
 * The place a move button sends a card to. Null means the button is not shown;
 * `disabled` means it is shown but cannot be used.
 */
export function moveOption(columns: Columns, place: Place, dir: MoveDir): { to: Place; disabled: boolean } | null {
  const { column, index } = place;
  const count = columns[column].cards.length;
  if (dir === "up") return index > 0 ? { to: { column, index: index - 1 }, disabled: false } : null;
  if (dir === "down") return index < count - 1 ? { to: { column, index: index + 1 }, disabled: false } : null;
  const position = COLUMNS.indexOf(column) + (dir === "left" ? -1 : 1);
  if (position < 0 || position >= COLUMNS.length) return null;
  const target = COLUMNS[position];
  return { to: { column: target, index: columns[target].cards.length }, disabled: !canEnter(columns, target) };
}

export function planMove(columns: Columns, id: number, dir: MoveDir): { from: Place; to: Place } | null {
  const found = findCard(columns, id);
  if (!found) return null;
  const option = moveOption(columns, found, dir);
  if (!option || option.disabled) return null;
  return { from: { column: found.column, index: found.index }, to: option.to };
}
