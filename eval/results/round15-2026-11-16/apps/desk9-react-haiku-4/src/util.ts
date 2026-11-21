// A number no earlier call has returned, so that an answer can be matched to the request that asked for it.
let last = 0;

export function nextToken(): number {
  last += 1;
  return last;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
