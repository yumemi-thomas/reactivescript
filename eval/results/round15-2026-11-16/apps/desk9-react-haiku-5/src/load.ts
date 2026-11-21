export type Load<T> =
  | { status: "loading" }
  | { status: "ok"; value: T }
  | { status: "error"; message: string };

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "unknown error";
}
