# S-store-kept-row — a kept key keeps its row, whatever the row's body reads

Rules: ST-4a, ST-4b, RG-2a, RG-2c.

A keyed source written fresh rows keeps the row of every key it keeps,
wherever the new list puts it — also where nothing in the row reads the
row (`for r in p.rows { <Made /> }`), and where the list reaches the loop
through a prop. The key holds at any depth: a list inside a row is
reconciled by it too. Solid's `reconcile(v, key)` gave a row whose fields
nothing read a new proxy, and `<For>` remade it (the third review's X1:
state lost, silent in production; Solid issue #5220). The runtime kept it
(`ref/compile/keyed.ts`) until Solid fixed `reconcile` (#5222, main
510bb8d01): the lowering is `reconcile(v, key)` again, and this scenario
holds Solid to the rule. `Made` logs when its region is made.

## Program

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
  source groups: { id: string; items: { id: string; v: string }[] }[] key id := [{ id: "g", items: [{ id: "a", v: "a" }, { id: "b", v: "b" }] }]
  <L rows={rows} />
  {for g in groups { <p>{for i in g.items { <Made v={i.v} /> }}</p> }}
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `xxab` | log(made, x); log(made, x); log(made, a); log(made, b) |
| 1 | handler `rows := [{ id: "b", v: "B" }, { id: "c", v: "c" }]` | `xxab` | log(made, x) |
| 2 | handler `rows := [{ id: "a", v: "A" }, { id: "b", v: "b" }]` | `xxab` | log(made, x) |
| 3 | handler `rows := rs => [{ id: "b", v: "b" }, { id: "a", v: "a" }]` | `xxab` | — |
| 4 | handler `groups := [{ id: "g", items: [{ id: "b", v: "B" }, { id: "c", v: "c" }] }]` | `xxBc` | log(made, c) |

Instant 1: row `b` is kept (it moves to the front), `c` is made, `a` ends.
Instant 2: `b` is kept again, `a` is made anew (its key was gone). Instant
3: an updater's fresh rows are reconciled by the key as a written list is
(W-6): both rows move, nothing is made. Instant 4: the inner list of a kept
group is reconciled by the key too — `b` keeps its row and its `Made`
reads the new value, `c` is made.
