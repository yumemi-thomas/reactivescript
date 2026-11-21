let counter = 0;

/** A process-wide unique id, for request generations and optimistic operations. Call it from event handlers only. */
export function newId(): number {
  counter += 1;
  return counter;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** The result of a request, tagged with the generation that asked for it. */
export type Loaded<T> = { gen: number; ok: true; data: T } | { gen: number; ok: false; message: string };
