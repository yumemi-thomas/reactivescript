# S-optional-1 — a fn's optional parameter

Rules exercised: E-9a, E-2, E-9, E-10, MO-9b, 07 §2, TY-2.

A trailing value parameter written `b?: T` may be left out of a call. Left out, it is `undefined`: `add(n)` is `add(n, undefined)`,
whoever calls it. In the body it is `T | undefined`, as TypeScript has it. There is no default: the body says what nothing means.

## Modules

```rx
-- module: ./lib.rx
export fn add(a: number, b?: number): number => a + (b ?? 10)
export fn createCounter(ref start: number, options?: { step?: number }) {
  source n := peek start
  action bump() { n := x => x + (options?.step ?? 1) }
  { n: n, bump: bump, behind: n < start }
}
```

`export pure fn add(a: number, b?: number)` and `export pure fn createCounter(ref start: number, options?: { step?: number }): …`:
the printed rows keep the mark, and an importer read against them gets the same verdicts.

## Program

```rx
import { add, createCounter } from "./lib.rx"
fn label(n: number, unit?: string): string => unit == undefined ? `${n}` : `${n}${unit}`
export default component App() {
  source n := 1
  source unit: string | undefined := undefined
  ops = { plus: add, one: (a: number) => add(a) }
  c = createCounter(n)
  d = createCounter(n, { step: 5 })
  action go() { n := x => x + 1 }
  action both() { c.bump(); d.bump() }
  action px() { unit := "px" }
  <p>{add(n)} {add(n, undefined)} {add(n, 2)} {label(n, unit)} {ops.plus(n, 3)} {ops.one(n)} {c.n} {d.n} {c.behind ? "behind" : "level"}</p>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `11 11 3 1 4 11 1 1 level` |
| 1 | handler `go()` | `12 12 4 2 5 12 1 1 behind` |
| 2 | handler `both()` | `12 12 4 2 5 12 2 6 level` |
| 3 | handler `px()` | `12 12 4 2px 5 12 2 6 level` |

`add(n)` is an equation over `n`, as any lifted call (E-2); `label(n, unit)` follows `unit` as it becomes `undefined` or is not. A
call that instantiates snapshots what it is given (E-10) and an argument left out is nothing to snapshot.

## Accepted variants

```rx
-- accept
fn f(a: number, b?) => b == undefined ? a : b
fn g(a?: number, b?: number): number => (a ?? 0) + (b ?? 0)
fn h(a: number, b?: number): number => b == undefined ? a : a + b
export default component App() { source n := 1
  <p>{f(n)} {g()} {g(n)} {g(n, n)} {h(1)}</p> }
```

## Rejected variants

A reactive argument in an optional parameter's place is snapshotted like any:

```rx
-- reject: SNAPSHOT_ARGUMENT
fn createScaled(ref n: number, by?: number): number { m = n * (by ?? 2)
  m }
export default component App() { source n := 1  source by := 3
  s = createScaled(n, by)
  <p>{s}</p> }
```

```rx
-- reject: PARSE
fn f(a?: number, b: number): number => b
export default component App() { <p>{f(1, 2)}</p> }
```

```rx
-- reject: PARSE
fn f(ref a?: number): number => a ?? 0
export default component App() { x = f(1)
  <p>{x}</p> }
```

```rx
-- reject: PARSE
fn f(a?: number, ref b: number): number => b
export default component App() { x = f(1, 2)
  <p>{x}</p> }
```

A default is not a form of the language; nor is an action's, a closure's or a server fn's optional parameter:

```rx
-- reject: E-9
fn f(a: number = 3): number => a
export default component App() { <p>{f()}</p> }
```

```rx
-- reject: PARSE
export default component App() { source n := 1  action set(a?: number) { n := a ?? 0 }
  <p onClick={set}>{n}</p> }
```

```rx
-- reject: PARSE
export default component App() { f = (a?: number) => a
  <p>{f()}</p> }
```

In the body the parameter may be `undefined`, and a required argument stays required:

```rx
-- types: TS18048
fn f(a: number, b?: number): number => a + b
export default component App() { <p>{f(1)}</p> }
```

```rx
-- types: TS2554
fn f(a: number, b?: number): number => a + (b ?? 0)
export default component App() { <p>{f()}</p> }
```

```rx
-- types: TS2345
fn f(a: number, b?: number): number => a + (b ?? 0)
export default component App() { <p>{f(1, "2")}</p> }
```
