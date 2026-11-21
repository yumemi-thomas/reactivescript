/**
 * A monotonic logical clock shared by every request in the app.
 *
 * Loads are stamped when they are asked; mutations are stamped when the server
 * answers. Comparing stamps tells whether an answer already reflects a change
 * (it was asked after the change landed) or may predate it.
 */
let now = 0;

export function stamp(): number {
  now += 1;
  return now;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "unknown error";
}
