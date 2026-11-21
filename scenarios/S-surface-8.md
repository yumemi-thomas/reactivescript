# S-surface-8 — a kept `peek` of a field: a row's, a primitive instance's

Rules: E-5a, RG-2b, ST-4a, MO-10b.

A `for` row's binding is a constant (RG-2b) and so is the instance a
declared primitive made (MO-10b): neither name ever changes. What is read
*through* them does. A row's fields are written by path (`rows[0].x := 2`)
or reconciled by key (ST-4a) while the row lives; an instance's fields
track as a store's do. So a kept `peek` of such a field freezes as a kept
`peek` of a written source does (S-surface-6), and is `SNAPSHOT_KEPT` when
the row's list can change, or the name is an instance.

## Modules

```rx
-- module: ./prims.d.rx
export pure fn createWindowSize(): { readonly width: number; readonly height: number } instantiates
```

## Program

```rx
component Row(props: { row: any }) {
  <li>{props.row.x}</li>
}

export default component App() {
  source rows key id := [{ id: 1, x: 1 }]
  source n := 1
  <ul>{for r in rows { <li>{peek r.x}</li> <Row row={peek r} /> }}</ul>
  <p>{n}</p>
  <button onClick={() => { n := n + 1 }}>+</button>
}
```

Accepted: nothing writes `rows`, so `peek r.x` reads a field that never
changes; and `peek r`, the row itself, is a constant whatever happens to
the list.

## Rejected variants

```rx
-- reject: SNAPSHOT_KEPT
export default component App() {
  source rows key id := [{ id: 1, x: 1 }]
  <ul>{for r in rows { <li>{peek r.x}</li> }}</ul>
  <button onClick={() => { rows[0].x := 2 }}>+</button>
}
```

The row for `id: 1` survives the write, so `{peek r.x}` would show `1`
for as long as it lives.

```rx
-- reject: SNAPSHOT_KEPT
export default component App() {
  source rows := [{ id: 1, x: 1 }]
  shown = filter(rows, r => r.x > 0)
  <ul>{for r in shown { <li>{peek r.x}</li> }}</ul>
  <button onClick={() => { rows[0].x := 2 }}>+</button>
}
```

The same through a selection of the list (ST-4b): the rows are the
source's.

```rx
-- reject: SNAPSHOT_KEPT
import { createWindowSize } from "./prims.js"
export default component App() {
  size = createWindowSize()
  <p>{peek size.width}</p>
}
```

`size` never changes; `size.width` follows the window.

```rx
-- reject: SNAPSHOT_KEPT
import { createWindowSize } from "./prims.js"
export default component App() {
  size = createWindowSize()
  w = size.width
  shown = peek w
  <p>{shown}</p>
}
```

An equation bound to the field follows it (E-10 reads it the same way,
S-module-20).
