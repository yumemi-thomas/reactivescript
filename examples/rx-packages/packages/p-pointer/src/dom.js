import { toStateActive, DEFAULT_STATE } from "@solid-primitives/pointer";
export const stateOf = (e, active) => e ? toStateActive(e, active) : DEFAULT_STATE;
export function watchPointer(target, types, f) {
  const t = target ?? document, ok = (e) => !types || types.includes(e.pointerType), on = { enter: "pointerenter", move: "pointermove", leave: "pointerleave" }, hs = [];
  for (const [k, type] of Object.entries(on)) { const h = (e) => { if (ok(e)) f(k, e); }; t.addEventListener(type, h); hs.push(() => t.removeEventListener(type, h)); }
  return () => hs.forEach((h) => h());
}
