import type { Archived, Card as ApiCard, Item as ApiItem } from "./api.js";

export type Column = "todo" | "doing" | "done";
export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];
export const COLUMN_NAMES: Record<Column, string> = { todo: "To do", doing: "Doing", done: "Done" };
export const WIP_LIMIT = 3;

export type Direction = "left" | "right" | "up" | "down";

/** A card as the board shows it. `id` is null while the server has not yet answered its add. */
export type CardView = { key: string; id: number | null; title: string; done: number; total: number };
export type Columns = Record<Column, CardView[]>;

/** A checklist item as the detail shows it. `id` is null while the server has not yet answered its add. */
export type ItemView = { key: string; id: number | null; text: string; done: boolean };

export type Place = { column: Column; index: number };
export type ArchivedRow = Archived;

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function toCardView(card: ApiCard): CardView {
  return { key: `c${card.id}`, id: card.id, title: card.title, done: card.done, total: card.total };
}

export function toItemView(item: ApiItem): ItemView {
  return { key: `i${item.id}`, id: item.id, text: item.text, done: item.done };
}

export function locate(columns: Columns, id: number): (Place & { card: CardView }) | undefined {
  for (const column of COLUMNS) {
    const index = columns[column].findIndex((c) => c.id === id);
    if (index !== -1) return { column, index, card: columns[column][index] };
  }
  return undefined;
}

export function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
  const at = Math.min(Math.max(index, 0), list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
}

export function neighbourColumn(column: Column, dir: "left" | "right"): Column | undefined {
  const i = COLUMNS.indexOf(column) + (dir === "left" ? -1 : 1);
  return i < 0 || i >= COLUMNS.length ? undefined : COLUMNS[i];
}

/** Where a move would put the card: the bottom of the next column, or one step up or down in its own column. */
export function planMove(columns: Columns, id: number, dir: Direction): { from: Place; to: Place } | undefined {
  const found = locate(columns, id);
  if (!found) return undefined;
  const from: Place = { column: found.column, index: found.index };
  if (dir === "up" || dir === "down") {
    const index = dir === "up" ? found.index - 1 : found.index + 1;
    if (index < 0 || index >= columns[found.column].length) return undefined;
    return { from, to: { column: found.column, index } };
  }
  const column = neighbourColumn(found.column, dir);
  if (!column) return undefined;
  return { from, to: { column, index: columns[column].length } };
}

export function mapCards(columns: Columns, match: (c: CardView) => boolean, change: (c: CardView) => CardView): Columns {
  const map = (list: CardView[]) => list.map((c) => (match(c) ? change(c) : c));
  return { todo: map(columns.todo), doing: map(columns.doing), done: map(columns.done) };
}

export function dropCards(columns: Columns, match: (c: CardView) => boolean): Columns {
  const keep = (list: CardView[]) => list.filter((c) => !match(c));
  return { todo: keep(columns.todo), doing: keep(columns.doing), done: keep(columns.done) };
}

/** Takes the card with this id out of its column and puts it at `to`. Unchanged if the card is not on the board. */
export function relocate(columns: Columns, id: number, to: Place): Columns {
  const found = locate(columns, id);
  if (!found) return columns;
  const without = dropCards(columns, (c) => c.id === id);
  return { ...without, [to.column]: insertAt(without[to.column], to.index, found.card) };
}
