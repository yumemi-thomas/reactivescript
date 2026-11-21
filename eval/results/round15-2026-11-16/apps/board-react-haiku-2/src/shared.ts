import type { Column } from "./api.js";

export const COLUMNS: readonly Column[] = ["todo", "doing", "done"];

export const COLUMN_NAMES: Record<Column, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
};

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let keySeq = 0;

/** A key that is unique for the life of the page, used for optimistic rows. */
export function nextKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}${keySeq}`;
}
