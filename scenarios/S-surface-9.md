# S-surface-9 — a row's field as a value argument

Rules: E-10, E-4, RG-2b, ST-4a.

A `for` row's binding is a constant (RG-2b); its fields are not: they are
written by path (`rows[0].x := 2`) or reconciled by key (ST-4a) while the
row lives. So a field read through a row, passed for a value parameter of
an instantiation, is a snapshot of something that changes, as a source
passed there is (S-region-6): `SNAPSHOT_ARGUMENT`. E-10 does not ask
whether the list is ever written, as it does not ask whether a source is.

Two snapshots are meant, and say so. A source's seed is one by rule (E-4):
`source draft := r.x` starts an edit from the row and then lives on its
own. And `peek r.x` in the argument is the call site's own word for
"once" (E-10); it is not kept there, so it is no `SNAPSHOT_KEPT` either
(E-5a, S-surface-8). The row passed whole reads no field.

## Program

```rx
export default component App() {
  fn counter(start) {
    source extra := 0
    total = start + extra
    total
  }
  fn first(row) {
    source open := false
    label = open ? row.x : 0
    label
  }
  source rows key id := [{ id: 1, x: 1 }]
  <ul>{for r in rows {
    source draft := r.x
    c = counter(peek r.x)
    f = first(r)
    <li>{draft} {c} {f}</li>
  }}</ul>
  <button onClick={() => { rows[0].x := 2 }}>+</button>
}
```

Accepted: the seed and the `peek` are snapshots by their own word, and
`first(r)` is given the row, whose fields it reads live.

## Rejected variants

```rx
-- reject: SNAPSHOT_ARGUMENT
export default component App() {
  fn counter(start) {
    source extra := 0
    total = start + extra
    total
  }
  source rows key id := [{ id: 1, x: 1 }]
  <ul>{for r in rows {
    c = counter(r.x)
    <li>{c}</li>
  }}</ul>
  <button onClick={() => { rows[0].x := 2 }}>+</button>
}
```

`counter` is instantiated once per row, with `r.x` as it was then: the
row for `id: 1` survives the write and `c` stays `1`.

```rx
-- reject: SNAPSHOT_ARGUMENT
export default component App() {
  fn counter(start) {
    source extra := 0
    total = start + extra
    total
  }
  source rows := [{ id: 1, tags: ["a"] }]
  shown = filter(rows, r => r.id > 0)
  <ul>{for r in shown {
    c = counter(r.tags[0])
    <li>{c}</li>
  }}</ul>
}
```

The same through a selection of the list (ST-4b) and a deeper path.
