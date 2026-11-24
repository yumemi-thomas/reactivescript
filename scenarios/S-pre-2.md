# S-pre-2 — `pre` of a store is what it was, at any depth

Rules: C-2, ST-2a.

A path write is a change of the source it is written into: `pre` of it is
what it held before, and what has not changed since is the same value (a row
of `pre rows` is the row, so `includes` tells an added one).

## Program

```rx
export default component App() {
  source value := { outer: { n: 1 } }
  source rows := [{ id: 1, n: 1 }, { id: 2, n: 1 }]
  old = pre value -> { outer: { n: 0 } }
  added = rows.filter(r => !(pre rows -> []).includes(r))
  seen: any = [...(pre seen -> []), value]
  <p>{old.outer.n} {str(added.map(r => r.id))} {str(seen.map(s => s.outer.n))}</p>
}
```

## Frames

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `0 [1,2] [1]` |
| 1 | handler `value.outer.n := 2` | `1 [1,2] [1,2]` |
| 2 | handler `value.outer.n := 3` | `2 [1,2] [1,2,3]` |
| 3 | handler `rows := rs => [...rs, { id: 3, n: 0 }]` | `2 [3] [1,2,3]` |
| 4 | handler `value := { outer: { n: 9 } }` | `3 [3] [1,2,3,9]` |
