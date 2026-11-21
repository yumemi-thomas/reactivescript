export const errMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** Copy of a record without one key. */
export function without<T extends Record<string, unknown>>(o: T, key: string): T {
  const copy: Record<string, unknown> = { ...o };
  delete copy[key];
  return copy as T;
}
