import { useEffect, useState } from "react";

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

let counter = 0;
/** a process-wide increasing number, for ordering requests and making fresh keys */
export function nextSeq(): number {
  counter += 1;
  return counter;
}

export type Req<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; error: string };

/**
 * Runs `fn` whenever `key` changes (null: nothing is asked). Only the answer for the
 * current key is ever shown; answers for superseded keys are dropped. `fn` must only
 * change when `key` does.
 */
export function useRequest<T>(key: string | null, fn: () => Promise<T>): Req<T> {
  const [state, setState] = useState<{ key: string; r: Req<T> } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    fn().then(
      data => {
        if (live) setState({ key, r: { status: "ok", data } });
      },
      (e: unknown) => {
        if (live) setState({ key, r: { status: "error", error: errMsg(e) } });
      },
    );
    return () => {
      live = false;
    };
  }, [key, fn]);
  if (key === null) return { status: "idle" };
  if (state === null || state.key !== key) return { status: "loading" };
  return state.r;
}
