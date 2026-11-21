let counter = 0;

/** A process-wide, ever-increasing sequence number. Call it only from event handlers and effects. */
export function nextSeq(): number {
  counter += 1;
  return counter;
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "unknown error";
}
