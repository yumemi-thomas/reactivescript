export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type Result<T> = { kind: "ok"; value: T } | { kind: "error"; message: string };
