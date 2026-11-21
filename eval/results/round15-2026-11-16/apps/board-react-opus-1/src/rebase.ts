import { useCallback, useReducer } from "react";

/**
 * Optimistic state: a base (what the server has confirmed) plus a queue of operations
 * applied on top in the order they were started. A failed operation is dropped from the
 * queue, so the view goes back to what it would be without it while every other pending
 * operation stays applied. Confirmed operations are folded into the base in start order,
 * so answers that arrive out of order still end in the right state.
 */
type Entry<O> = { key: number; op: O; confirmed: boolean };
type State<B, O> = { base: B; ops: Entry<O>[] };
type Action<B, O> =
  | { type: "base"; update: (b: B) => B }
  | { type: "add"; key: number; op: O }
  | { type: "confirm"; key: number; op: O }
  | { type: "drop"; key: number };

let seq = 0;
/** a process-wide unique number, also used for temporary negative ids */
export const nextSeq = () => ++seq;

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

function fold<B, O>(base: B, ops: Entry<O>[], apply: (b: B, op: O) => B): State<B, O> {
  let i = 0;
  while (i < ops.length && ops[i].confirmed) base = apply(base, ops[i++].op);
  return { base, ops: i ? ops.slice(i) : ops };
}

export function useRebased<B, O>(apply: (b: B, op: O) => B, init: () => B) {
  const reducer = (s: State<B, O>, a: Action<B, O>): State<B, O> => {
    switch (a.type) {
      case "base":
        return { ...s, base: a.update(s.base) };
      case "add":
        return { ...s, ops: [...s.ops, { key: a.key, op: a.op, confirmed: false }] };
      case "confirm":
        return fold(s.base, s.ops.map(e => (e.key === a.key ? { ...e, op: a.op, confirmed: true } : e)), apply);
      case "drop":
        return fold(s.base, s.ops.filter(e => e.key !== a.key), apply);
    }
  };
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ base: init(), ops: [] as Entry<O>[] }));

  const setBase = useCallback((update: (b: B) => B) => dispatch({ type: "base", update }), []);

  const run = useCallback(<R,>(op: O, request: () => Promise<R>, confirmed: (r: R) => O): Promise<R> => {
    const key = nextSeq();
    dispatch({ type: "add", key, op });
    return request().then(
      r => {
        dispatch({ type: "confirm", key, op: confirmed(r) });
        return r;
      },
      (e: unknown) => {
        dispatch({ type: "drop", key });
        throw e;
      },
    );
  }, []);

  const view = state.ops.reduce((b, e) => apply(b, e.op), state.base);
  return { view, setBase, run };
}
