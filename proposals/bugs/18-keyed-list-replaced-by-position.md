# A keyed source written a fresh list is not reconciled by its key

A reorder gives each row another row's state.

<!-- frames branch=pass upstream=fail -->
```rx
component Row(props: { name: string }) {
  source first := peek props.name
  <li>{props.name}{first} </li>
}
export default component App() {
  source rows key id := [{ id: 1, name: "a" }, { id: 2, name: "b" }]
  <ul>{for row in rows { <Row name={row.name} /> }}</ul>
}
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `aabb` |
| 1 | handler `rows := [{ id: 2, name: "B" }, { id: 1, name: "A" }]` | `BbAa` |

**On upstream (e650b85).** `expected 'BbAa', got 'BBAA'`: both rows are made again. Since #51 a keyed source that takes a guess is reconciled. A keyed *equation* over a question is. One over a source with no key was not, on both trees, until this round:

<!-- frames branch=pass upstream=fail -->
```rx
component Row(props: { name: string }) {
  source first := peek props.name
  <li>{props.name}{first}</li>
}
export default component App() {
  source input := [{ id: 1, name: "a" }, { id: 2, name: "b" }]
  rows key id = input
  <ul>{for row in rows { <Row name={row.name} /> }}</ul>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `aabb` |
| 1 | handler `input := [{ id: 2, name: "B" }, { id: 1, name: "A" }]` | `BbAa` |

Its rows *taken out* are still replaced, on both trees (known gap):

<!-- frames branch=fail upstream=fail -->
```rx
component Row(props: { name: string }) {
  source first := peek props.name
  <li>{props.name}{first}</li>
}
export default component App() {
  source input := [{ id: 1, name: "a" }, { id: 2, name: "b" }]
  rows key id = input.filter(r => r.id > 0)
  <ul>{for row in rows { <Row name={row.name} /> }}</ul>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `aabb` |
| 1 | handler `input := [{ id: 2, name: "B" }, { id: 1, name: "A" }]` | `BbAa` |

**Spec.** ST-4a: a new result is reconciled by `k`, *also on a source*; a reorder moves rows.

**Cause.** The write replaces the list's root. Solid's `reconcile(v, key)` is not called.

**Fix in this branch.** f4e7d3c: a write of a whole list to a keyed source is `reconcile(v, key)`.

**Test.** S-check-3, S-keyed-alias; `bench/tasks/keyed-edits`.
