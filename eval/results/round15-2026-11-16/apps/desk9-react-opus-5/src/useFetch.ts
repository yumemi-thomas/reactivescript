import { useEffect, useState } from "react";
import { errorMessage, tick } from "./util";

export type Load<T> =
  | { status: "loading" }
  | { status: "ok"; data: T; startedAt: number; answeredAt: number }
  | { status: "error"; error: string };

/**
 * Calls `fn(...args)` whenever `args` or `nonce` change and returns the latest answer.
 * Answers to superseded requests are ignored. `args === null` means: ask nothing.
 */
export function useFetch<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  args: A | null,
  nonce = 0,
): Load<T> | null {
  const key = args === null ? null : JSON.stringify([args, nonce]);
  const [res, setRes] = useState<{ key: string; load: Load<T> } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    const [a] = JSON.parse(key) as [A, number];
    const startedAt = tick();
    fn(...a).then(
      data => {
        if (live) setRes({ key, load: { status: "ok", data, startedAt, answeredAt: tick() } });
      },
      (e: unknown) => {
        if (live) setRes({ key, load: { status: "error", error: errorMessage(e) } });
      },
    );
    return () => {
      live = false;
    };
  }, [fn, key]);
  if (key === null) return null;
  return res !== null && res.key === key ? res.load : { status: "loading" };
}
