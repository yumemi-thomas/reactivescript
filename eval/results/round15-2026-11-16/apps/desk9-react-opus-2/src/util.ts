import { useEffect, useState } from "react";

let counter = 0;
/** A process-wide, ever-increasing number used to order requests and their answers. Call it only outside render. */
export function nextSeq(): number {
  counter += 1;
  return counter;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export type Async<T> =
  | { status: "loading" }
  | { status: "ok"; data: T; seq: number }
  | { status: "error"; message: string };

const LOADING = { status: "loading" } as const;

/**
 * Runs `fn(arg)` whenever `arg` or `nonce` changes and returns the answer for the current `arg`/`nonce` only:
 * answers to earlier arguments are ignored, so a slow stale answer never replaces a newer one.
 * `fn` must be stable (defined at module level). `arg === null` means "nothing to load".
 */
export function useAsync<A extends string | number, T>(
  fn: (arg: A) => Promise<T>,
  arg: A | null,
  nonce = 0,
): Async<T> {
  const [state, setState] = useState<{ arg: A; nonce: number; result: Async<T> } | null>(null);
  useEffect(() => {
    if (arg === null) return;
    let live = true;
    const seq = nextSeq();
    new Promise<T>(resolve => resolve(fn(arg))).then(
      data => {
        if (live) setState({ arg, nonce, result: { status: "ok", data, seq } });
      },
      (e: unknown) => {
        if (live) setState({ arg, nonce, result: { status: "error", message: errorMessage(e) } });
      },
    );
    return () => {
      live = false;
    };
  }, [fn, arg, nonce]);
  if (state !== null && state.arg === arg && state.nonce === nonce) return state.result;
  return LOADING;
}
