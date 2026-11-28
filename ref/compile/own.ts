// R-11a: an attribute that reads ahead is a reader of its own (emit.ts, `__rt.own`); shared by rt.ts and rt-web.ts, no import.
/** R-11a: the effects of `own`, made where it is called — the render pass that builds the element, not the `ref`, which
 *  Solid runs as an effect's callback (no primitive may be made there). Until the ref gives the element, a value waits. */
export function ownAttrs<E>(userRef: unknown, attrs: [string, () => unknown][], effect: (name: string, f: () => unknown, set: (v: unknown, prev: unknown) => void) => void, set: (el: E, name: string, v: unknown, prev: unknown) => void) {
  let el: E | undefined; const held = new Map<string, [unknown, unknown]>();
  for (const [name, f] of attrs) effect(name, f, (v, prev) => { if (el === undefined) held.set(name, [v, held.has(name) ? held.get(name)![1] : prev]); else set(el, name, v, prev); });
  return (e: E) => {
    el = e;
    for (const r of Array.isArray(userRef) ? userRef.flat(Infinity) : [userRef]) if (typeof r === "function") r(e);
    for (const [name, [v, prev]] of held) set(e, name, v, prev); held.clear();
  };
}
