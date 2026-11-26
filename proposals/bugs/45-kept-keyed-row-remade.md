# A kept keyed row is remade when nothing in it reads the row

A keyed source written fresh rows keeps the row of a key it keeps (06 ST-4a). In compiled code it did so only where
something in the row had read a field of it: a row whose body reads nothing of the row was remade, and its state lost.
The list reaching the loop through a prop, or a view given by the caller and shown in each row, are the common shapes
(a part that lists what it is given and shows a slot in each row). Silent in production; on main too.

<!-- frames branch=pass upstream=fail -->
```rx
component Made(q: { v: string }) {
  effect () { log("made", q.v) }
  <u>{q.v}</u>
}
component L(p: { rows: { id: string; v: string }[] }) {
  <ol>{for r in p.rows { <Made v="x" /> }}</ol>
}
export default component App() {
  source rows: { id: string; v: string }[] key id := [{ id: "a", v: "a" }, { id: "b", v: "b" }]
  <L rows={rows} />
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `xx` | log(made, x); log(made, x) |
| 1 | handler `rows := [{ id: "b", v: "B" }, { id: "c", v: "c" }]` | `xx` | log(made, x) |

**On main (bbe2a189, the third review's `x4` run) and on this branch before the fix (c8ed3aa6).** Instant 1 logs `made` twice: row `b` is made
again. The interpreter logs once. The oracle replaced a keyed source's rows by position (no key at all) and logged twice
as well. An updater's fresh rows (`rows := rs => [{ id: "b", … }]`) were not reconciled by the key in either emitter:
every row was remade, also where the row's body reads it.

**Spec.** ST-4a: a new value written to a keyed source is reconciled by the key, rows with the same key keep their object
identity, "the key applies at any depth, as Solid's"; RG-2a: a row region lives while an identical element is present.

**Cause.** Solid's `reconcile(v, key)` (`@solidjs/signals`, `store/reconcile.ts` `descend`, at the pin 30e7805 and in
2.0.4) adopts a surviving row's new raw object into the row's proxy only where something below the row was read under
tracking ("descending into a changed child pair only where a target with nodes exists below", §6d). A row nothing has
read keeps the new raw object, which wraps to a new proxy, and `<For>`, keyed by identity, makes a new row for it. The
same in TSX, with nothing of this language:

```tsx
const [rows, setRows] = createStore([{ id: "a", v: "a" }, { id: "b", v: "b" }]);
<For each={rows}>{() => <Made />}</For>          // a row that reads nothing of its item
setRows(reconcile([{ id: "b", v: "B" }, { id: "c", v: "c" }], "id"));   // Made of `b` is made again
```

Its own header says "surviving rows keep their proxy identity"; with a field read in the row they do. Nothing is
filed (track 2 needs no upstream fix). *Memo (2026-11-26):* the plain-Solid issue is solidjs/solid#5220, with fix PR #5222, both open
(`solid-main.noindex/drafts/1-reconcile-kept-row`: main ad1f561, 2.0.4, 2.0.0, rc.23, rc.21; again on main 50a4bfdde,
after #4906 replaced the store engine, 2026-11-27). The fix below works around it; once Solid keeps the proxy,
`keyedWrite` goes back to `reconcile(v, key)`.

**Fix in this branch.** `ref/compile/keyed.ts`: before the list is reconciled, each row of the new value whose key is a
row's of the old one is reconciled into that row's own proxy, so the list's reconcile finds the new raw already the row's
(lists and records inside a row the same way). Used by both runtimes (`rt-web.ts`, `rt.ts`) and the oracle, for a write
and for what an updater answers. The interpreter reconciles a list inside a row by the key too (it paired them by
position), as ST-4a says. Both emitters' code is unchanged.

**Test.** `scenarios/S-store-kept-row.md` (four runners); `compiler/test/rows.mjs` (a row's own state, direct, through a
prop and read, rendered and hydrated, development and production; fails on the old runtime).
