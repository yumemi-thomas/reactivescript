# S-region-6 — lifted calls vs instantiation

Rules exercised: E-9, E-10 (diagnostic), RG-6a, RG-6b, RG-6c.

## Program

```rx
export default component App() {
  fn double(v) => v * 2
  fn counter(ref base, step) {
    source extra := 0
    total = base + extra + step
    total
  }
  source n := 1
  d = double(n)
  t = counter(n, 10)

  <p>{d} {t}</p>
}
```

## Frames

| instant | action               | frame   |
| ------- | -------------------- | ------- |
| 0       | mount                | `2 11`  |
| 1       | handler `n := 2`     | `4 12`  |
| 2       | handler `extra := 5` | `4 17`  |
| 3       | handler `n := 3`     | `6 18`  |

`d = double(n)` is lifted: an equation over `n` (E-9). `t = counter(n, 10)`
is an instantiation: once, in a nested region (RG-6a); `base` is `n` by
reference, `step` is a snapshot (RG-6b); `extra` persists across changes
of `n` — the body did not re-run (instant 3 shows 3 + 5 + 10).

## Rejected variants

```rx
-- reject: SNAPSHOT_ARGUMENT
export default component App() {
  fn watch(v) {
    effect (v) { log(v) }
    v
  }
  source n := 1
  w = watch(n)

  <p>{w}</p>
}
```

```rx
-- reject: E-9
export default component App() {
  fn counter(ref base) {
    source extra := 0
    base + extra
  }
  source n := 1

  <p>{counter(n)}</p>
}
```

A closure reads when it is called, and a closure given to a closure is
called by it (E-10, 2026-11-22): through a field of the argument, as the
argument itself, handed on to another closure, and where the callee
gives the argument's closure what it reads.

```rx
-- reject: SNAPSHOT_ARGUMENT
export default component App() {
  fn watch(v) {
    effect (v) { log(v) }
    v
  }
  source n := 1
  fmt = { total: () => n * 2 }
  pick = (o) => o.total()
  w = watch(pick(fmt))

  <p>{w}</p>
}
```

```rx
-- reject: SNAPSHOT_ARGUMENT
export default component App() {
  fn watch(v) {
    effect (v) { log(v) }
    v
  }
  source n := 1
  total = () => n * 2
  apply = (g: () => number) => g()
  w = watch(apply(total))

  <p>{w}</p>
}
```

```rx
-- reject: SNAPSHOT_ARGUMENT
export default component App() {
  fn watch(v) {
    effect (v) { log(v) }
    v
  }
  source n := 1
  fmt = { total: () => n * 2 }
  inner = (o) => o.total()
  outer = (o) => inner(o)
  w = watch(outer(fmt))

  <p>{w}</p>
}
```

```rx
-- reject: SNAPSHOT_ARGUMENT
export default component App() {
  fn watch(v) {
    effect (v) { log(v) }
    v
  }
  source n := 1
  fmt = { total: () => n * 2 }
  apply = (g) => g(fmt)
  w = watch(apply((o) => o.total()))

  <p>{w}</p>
}
```

The slot that is called is the one that is read: a field that is data, a
closure that reads nothing that changes, and a value only made into text
lose nothing.

```rx
-- accept
export default component App() {
  fn watch(v) {
    effect (v) { log(v) }
    v
  }
  source n := 1
  fmt = { total: () => n * 2, name: "fixed", unit: () => "px" }
  nameOf = (o) => o.name
  unitOf = (o) => o.unit()
  label = (o) => `${o.name}!`
  a = watch(nameOf(fmt))
  b = watch(unitOf(fmt))
  c = watch(label(fmt))

  <p>{a} {b} {c} {n}</p>
}
```
