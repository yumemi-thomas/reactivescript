export type Column = "todo" | "doing" | "done";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];

export const COLUMN_NAME: Record<Column, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
};

/** Cards that may sit in Doing at once. */
export const WIP_LIMIT = 3;

export type Dir = "left" | "right" | "up" | "down";

export type Pos = { column: Column; index: number };

/** A card on the board. `id` is missing until the server has answered its addCard. */
export type BoardCard = { key: string; id?: number; title: string; done: number; total: number };

/** A checklist item in the open detail. `id` is missing until the server has answered its addItem. */
export type BoardItem = { key: string; id?: number; text: string; done: boolean };

export type ArchivedCard = { id: number; title: string };

export type LoadState = { status: "loading" } | { status: "loaded" } | { status: "failed"; message: string };
