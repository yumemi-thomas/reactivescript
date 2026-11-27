// ST-5 (2026-11-27, the apps hunt): a write over a source with a question stands until the question's value changes — a re-ask
// that answers the same keeps it, as it is kept over a keyed list (whose rows keep their identity, so nothing recomputes).
// Solid's writable derived signal (createSignal(fn)) takes its compute's value on every recompute; this compute gives back
// the value it was written to when the question's value is the one it had. `refresh` of the source itself drops the write
// (AC-4). Shared by rt.ts and rt-web.ts, no import.
const plainCopy = (v: unknown): unknown => Array.isArray(v) ? v.map(plainCopy) : v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plainCopy(x)])) : v;
const same = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object" && Object.getPrototypeOf(a) === Object.prototype && Object.getPrototypeOf(b) === Object.prototype) {
    const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => k in (b as object) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
};
export function standing(fn: (prev: unknown) => unknown): { compute: (prev: unknown) => unknown; wrote: () => void; reset: () => void } {
  let written = false, has = false, last: unknown;
  const land = (v: unknown, prev: unknown) => { if (written && has && same(last, v)) return prev; last = plainCopy(v); has = true; written = false; return v; };
  return {
    compute: (prev: unknown) => {
      const r = fn(prev);
      if (r instanceof Promise) return r.then(v => land(v, prev));
      if (r !== null && typeof r === "object" && (Symbol.asyncIterator in (r as object))) { written = false; has = false; return r; }   // a stream (`await*`): each answer is its own
      return land(r, prev);
    },
    wrote: () => { written = true; },
    reset: () => { written = false; },
  };
}
