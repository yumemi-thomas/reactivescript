import { untrack } from "solid-js";
/** A timer over a delay that changes: `follow(delay)` answers what stops it. */
export function timer(run, set) {
  let done = false, started = performance.now(), prev, fraction = 0, spent = false;
  const call = () => { untrack(run); started = performance.now(); done = set === setTimeout; };
  const add = () => { if (typeof prev === "number") fraction += (performance.now() - started) / prev; };
  return { follow(delay) {
    const before = prev;
    const out = (() => {
      if (done) return;
      if (delay === false) { add(); return; }
      if (before === false) started = performance.now();
      if (spent) {
        add(); started = performance.now();
        if (fraction >= 1) { fraction = 0; call(); }
        else {
          const rest = (1 - fraction) * delay; fraction = 0; let main;
          const first = setTimeout(() => { spent = false; call(); if (!done) main = set(call, delay); }, rest);
          return () => { clearTimeout(first); clearInterval(main); };
        }
      }
      fraction = 0; spent = true;
      if (done) return;
      const id = set(call, delay);
      return () => clearInterval(id);
    })();
    prev = delay;
    return out ?? (() => {});
  } };
}
export const repeating = (f, ms) => setInterval(f, ms);
