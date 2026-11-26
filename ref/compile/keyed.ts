// ST-4a for a keyed source, on Solid: a new list written to it is reconciled by its key, and a row whose key is kept keeps
// its identity (so `<For>`, which keys by identity, keeps its region) — whether or not anything read a field of the row.
//
// Solid's `reconcile(v, key)` keeps a surviving row's proxy only where something below the row was read under tracking
// (packages/signals/src/store/reconcile.ts `descend`: "only where something is proxied below", §6d): a row whose body
// never reads a field of it (`for r in rows { <Made /> }`, or the list handed through a prop to a part that shows a view in
// each row) is given the new raw object, which wraps to a new proxy, and `<For>` remakes the row. Found by the third
// review (X1 of ROADMAP-fable: interpreter one row made, both emitters two); the same at the pin (30e7805) and at 2.0.4.
//
// So before the list is reconciled, each row of the new value whose key is a row's of the old one is reconciled into that
// row's own proxy first (`reconcile(n, key)(row)` adopts `n` as the row's backing): the list's reconcile then finds the
// new raw already the row's, and the row keeps its proxy. Records and lists inside a row are walked the same way, so the
// key holds at any depth, as Solid's does. Nothing is written that the list's reconcile would not write: the rows'
// readers are told of the fields that changed, once, as they were.
type Reconcile = (v: any, key: string) => (state: any) => void;
const isObj = (v: unknown): v is Record<PropertyKey, any> => v !== null && typeof v === "object";

/** `setStore(keyedWrite(reconcile, $TARGET, v, key))`: Solid's `reconcile(v, key)`, with the rows whose key is kept kept. */
export function keyedWrite(reconcile: Reconcile, TARGET: symbol, v: unknown, key: string) {
  const proxy = (x: unknown) => isObj(x) && (x as any)[TARGET] !== undefined;
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
