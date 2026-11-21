let clock = 0;
/** A monotonic logical clock used to order requests and their outcomes. */
export function tick(): number {
  clock += 1;
  return clock;
}

let ids = 0;
export function nextId(): number {
  ids += 1;
  return ids;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
