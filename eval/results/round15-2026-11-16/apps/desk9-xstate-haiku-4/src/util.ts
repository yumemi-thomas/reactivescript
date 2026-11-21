/** The text of a thrown value, for showing to the user. */
export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The value, or a thrown error when a machine reaches a state that needs it and it is missing. */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(what);
  return value;
}

export function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

export function insertAt<T>(list: T[], index: number, item: T): T[] {
  return [...list.slice(0, index), item, ...list.slice(index)];
}

export function removeAt<T>(list: T[], index: number): T[] {
  return [...list.slice(0, index), ...list.slice(index + 1)];
}
