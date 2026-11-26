// ST-4a for a keyed source, on Solid: a new list written to it is reconciled by its key, and a row whose key is kept keeps
// its identity (so `<For>`, which keys by identity, keeps its region) — whether or not anything read a field of the row.
//
// Solid's `reconcile(v, key)` keeps a surviving row's proxy only where something below the row was read under tracking
// (until #4906, packages/signals/src/store/reconcile.ts `descend`: "only where something is proxied below", §6d; since,
// store/thin.ts `merge`: "a keyed diff of a plain store skips a row nothing below ever read through a node"): a row whose body
// never reads a field of it (`for r in rows { <Made /> }`, or the list handed through a prop to a part that shows a view in
// each row) is given the new raw object, which wraps to a new proxy, and `<For>` remakes the row. Found by the third
// review (X1 of ROADMAP-fable: interpreter one row made, both emitters two); the same at the pin (30e7805) and at 2.0.4.
//
// So before the list is reconciled, each row of the new value whose key is a row's of the old one is reconciled into that
// row's own proxy first (`reconcile(n, key)(row)` adopts `n` as the row's backing): the list's reconcile then finds the
// new raw already the row's, and the row keeps its proxy. Records and lists inside a row are walked the same way, so the
// key holds at any depth, as Solid's does. Nothing is written that the list's reconcile would not write: the rows'
// readers are told of the fields that changed, once, as they were.
//
// Memo (2026-11-26, 2026-11-27): this works around Solid, not a design of the language. Solid's documentation promises a
// kept proxy for a kept key; its code prunes a row nothing has subscribed to, a prune ruled intended in solidjs/solid#2902
// and pinned by a test. Filed upstream as solidjs/solid#5220 (open), fix proposed in #5222 (open); reproduced on main
// ad1f561, 2.0.4, 2.0.0, rc.23, rc.21 (solid-main.noindex/drafts/1-reconcile-kept-row; the cause in `descend()`), and
// again on main 50a4bfdde after #4906 deleted `store/reconcile.ts`: the thin engine's `merge` prunes the same way (the
// draft's repro.mjs, `none`, remakes both rows). Once Solid keeps the proxy itself, `keyedWrite` can become
// `reconcile(v, key)` again, with compiler/test/rows.mjs and S-store-kept-row as the check. If Solid documents the prune
// instead, this stays, as the language's own lowering of ST-4a (proposals/32). (Until the pin moved to 50a4bfdde,
// `isStore` was `x[$TARGET] !== undefined`; the thin engine answers `$TARGET` with nothing for every value, so every row
// was taken for a plain object and S-store-kept-row made a row twice.)
type Reconcile = (v: any, key: string) => (state: any) => void;
const isObj = (v: unknown): v is Record<PropertyKey, any> => v !== null && typeof v === "object";

/** `setStore(keyedWrite(reconcile, isStore, v, key))`: Solid's `reconcile(v, key)`, with the rows whose key is kept kept. */
export function keyedWrite(reconcile: Reconcile, isStore: (x: unknown) => boolean, v: unknown, key: string) {
  const proxy = (x: unknown) => isObj(x) && isStore(x);
  // `px` is a proxy of this store, `nv` the value written in its place; both are objects of one kind
  const keep = (px: Record<PropertyKey, any>, nv: Record<PropertyKey, any>): void => {
    if (Array.isArray(nv)) {
      const byKey = new Map<unknown, Record<PropertyKey, any>>();
      for (let j = 0; j < px.length; j++) { const p = px[j]; if (isObj(p) && !Array.isArray(p) && proxy(p) && p[key] !== undefined && !byKey.has(p[key])) byKey.set(p[key], p); }
      for (const n of nv) {
        if (!isObj(n) || Array.isArray(n) || proxy(n) || n[key] === undefined) continue;   // a proxy is a row already (this store's or another's lent): Solid keeps it
        const p = byKey.get(n[key]); if (p === undefined) continue;
        byKey.delete(n[key]);   // one row for one key (ST-4d: a second is the data's to keep distinct)
        keep(p, n); reconcile(n, key)(p);
      }
      return;
    }
    for (const f of Object.keys(nv)) {
      const p = px[f], n = nv[f];
      if (!isObj(p) || !isObj(n) || !proxy(p) || proxy(n) || Array.isArray(p) !== Array.isArray(n)) continue;
      if (Array.isArray(n)) keep(p, n);
      else if (p[key] === n[key]) { keep(p, n); reconcile(n, key)(p); }   // another key is another record: replaced, as Solid's
    }
  };
  return (state: any) => {
    if (isObj(v) && !proxy(v) && Array.isArray(state) === Array.isArray(v)) keep(state, v);
    reconcile(v, key)(state);
  };
}
