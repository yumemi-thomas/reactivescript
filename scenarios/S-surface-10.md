# S-surface-10 — the loop of imperative scope: `for (const x of xs) { … }`

Rules: 07 §5, W-6, AC-1, AC-1d, MO-10i.

Imperative scope has a loop, JavaScript's `for … of`: `for (const x of e)
{ … }` runs its block once for each value `e` holds when the loop starts,
`x` a constant of that turn. It is a statement, so its body is the scope
it is written in: the same run, the same change, the same `return`. That
is what a loop needs that a closure handed to `forEach` cannot give: the
body may `await` in an action (a hold-safe suspension, AC-1), `return`
from the run, and name what a closure may not capture — a library's draft
(MO-10i, S-module-25). `for` in a view is the other form, `for x in e`
(07 §4), a region per row.

## Program

```rx
export default component App() {
  source total := 0
  source seen: string[] := []
  action addAll(xs: number[]) {
    for (const x of xs) { total := t => t + x }
  }
  action visit(names: string[]) {
    for (const n of names) {
      if (n == "stop") { return }
      seen := s => [...s, n]
    }
    seen := s => [...s, "end"]
  }
  action load(keys: string[]) {
    try {
      for (const k of keys) {
        let v = await fetch(k)
        seen := s => [...s, v]
      }
    } catch (e) {
      seen := s => [...s, "failed"]
    }
  }
  <p>{total} / {seen.join(",")}</p>
}
```

## Frames

| instant | action                              | frame          |
| ------- | ----------------------------------- | -------------- |
| 0       | mount                               | `0 /`          |
| 1       | handler `addAll([1, 2, 3])`         | `6 /`          |
| 2       | handler `visit(["a", "b"])`         | `6 / a,b,end`  |
| 3       | handler `visit(["c", "stop", "d"])` | `6 / a,b,end,c` |
| 4       | handler `for (const x of [10, 20]) { total := t => t + x }` | `36 / a,b,end,c` |
| 5       | handler `load(["k1", "k2"])`        | `36 / a,b,end,c` |
| 6       | resolve "k1" "one"                  | `36 / a,b,end,c` |
| 7       | resolve "k2" "two"                  | `36 / a,b,end,c,one,two` |

Instant 1: three functional writes to one slot in one instant compose
(W-6). Instant 3: `return` ends the run from inside the loop, so neither
`d` nor `end` is added. Instant 4: a handler's loop, no action. Instants
5–7: the action suspends at each turn's `await` and keeps its change open
(AC-1); both writes land when the body ends.

## Rejected variants

```rx
-- reject: STALE_OWN_READ
export default component App() {
  source total := 0
  action addAll(xs: number[]) {
    for (const x of xs) { total := total + x }
  }
  <p>{total}</p>
}
```

A second turn reads `total` after the first wrote it, in the same change:
the read sees the committed value, not the write (AC-1d). Write
functionally, `total := t => t + x`.

```rx
-- reject: PARSE
export default component App() {
  source total := 0
  action addAll(xs: number[]) {
    for (x of xs) { total := t => t + x }
  }
  <p>{total}</p>
}
```

The loop binds its variable, `const x`.

```rx
-- reject: UNBOUND
export default component App() {
  source total := 0
  action addAll(xs: number[]) {
    for (const x of xs) { total := t => t + x }
    total := t => t + x
  }
  <p>{total}</p>
}
```

`x` is the loop's own.
