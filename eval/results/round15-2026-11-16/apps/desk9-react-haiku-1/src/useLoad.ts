import { useEffect, useState } from "react";

export type LoadStatus = "idle" | "loading" | "ok" | "error";

export type Load<T> = {
  status: LoadStatus;
  /** the answer for the current key, when status is "ok" */
  value?: T;
  /** the failure message for the current key, when status is "error" */
  error?: string;
  /** the last answer that arrived, for any key: lets a page keep showing it while a new one loads */
  last?: T;
};

type Settled<T> = { key: string; ok: true; value: T } | { key: string; ok: false; error: string };

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Calls `load` whenever `key` changes (never when it is null) and reports the answer for the current key.
 * An answer that arrives after its key has gone is dropped.
 */
export function useLoad<T>(key: string | null, load: () => Promise<T>): Load<T> {
  const [state, setState] = useState<{ settled?: Settled<T>; last?: { value: T } }>({});

  useEffect(() => {
    if (key === null) return;
    let live = true;
    load().then(
      value => {
        if (live) setState(() => ({ settled: { key, ok: true, value }, last: { value } }));
      },
      error => {
        if (live) setState(prev => ({ ...prev, settled: { key, ok: false, error: errorMessage(error) } }));
      },
    );
    return () => {
      live = false;
    };
  }, [key, load]);

  const { settled, last } = state;
  const current = key !== null && settled !== undefined && settled.key === key ? settled : undefined;
  return {
    status: key === null ? "idle" : current === undefined ? "loading" : current.ok ? "ok" : "error",
    value: current && current.ok ? current.value : undefined,
    error: current && !current.ok ? current.error : undefined,
    last: last?.value,
  };
}
