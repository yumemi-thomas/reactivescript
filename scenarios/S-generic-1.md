# S-generic-1 — a generic fn

Rules exercised: 07 §2, TY-2, E-2, E-9, MO-9b, MO-13i.

A fn's type parameters are TypeScript's text: the checkers read none of it and the compiled JavaScript has none. A call infers
them; none is written at a call (`f<T>(x)` is two comparisons, 07 §3).

## Modules

```rx
-- module: ./lib.rx
export type Row = { id: number; name: string }
export fn first<T>(xs: T[], or: T): T => len(xs) > 0 ? xs[0] : or
export fn createPicked<T>(ref xs: T[], by: (x: T) => boolean): { list: T[]; top: T | undefined } {
  list: T[] = filter(xs, by)
  { list: list, top: list[0] }
}
export fn createHeld<T>(ref x: T): T {
  source calls := 0
  now: T = calls >= 0 ? x : peek x
  now
}
export fn pluck<T, K extends keyof T>(xs: T[], k: K): T[K][] => map(xs, (x) => x[k])
```

`export pure fn first<T>(xs: T[], or: T)`, `export pure fn createPicked<T>(ref xs: T[], by: (x: T) => boolean): { list: ref; top: ref } instantiates`:
the parameters are on the printed row, for the tool that writes the JavaScript types (MO-13i). An importer's checker reads none.

```rx
-- module: ./api.d.rx
export pure fn ask(n: string): Promise<number>
```

## Program

```rx
import { first, createPicked, createHeld, pluck, Row } from "./lib.rx"
fn pair<A, B = A>(a: A, b: B): [A, B] => [a, b]
export default component App() {
  source rows: Row[] := [{ id: 2, name: "bo" }, { id: 1, name: "al" }]
  source n := 1
  s = createPicked(rows, (r) => r.id < 2)
  top: Row | undefined = s.top
  label: string = first(rows, { id: 0, name: "-" }).name.toUpperCase()
  names: string[] = pluck(rows, "name")
  act = n > 1 ? () => "many" : () => "one"
  held = createHeld(act)
  told: string = held()
  [a, b] = pair(n, "x")
  action add() {
    rows := xs => [...xs, { id: 0, name: "cy" }]
    n := 2
  }
  <p>{label} {top == undefined ? "" : top.name} {names.join("+")} {told} {a.toFixed(1)}{b.length}</p>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `BO al bo+al one 1.01` |
| 1 | handler `add()` | `BO al bo+al+cy many 2.01` |

Where `T` is a function (`act`, given to `ref x: T`), the parameter holds the function and reading it does not call it.

## Accepted variants

```rx
-- accept
fn id<const T extends readonly unknown[] = []>(x: T): T => x
fn cmp(a: number, b: number, c: number): boolean => a<b && b>(c)
fn none<T>(): T[] => []
export default component App() {
  xs: readonly [1, 2] = id([1, 2])
  ys: string[] = none()
  <p>{len(xs)} {len(ys)} {cmp(1, 2, 0) ? "t" : "f"}</p>
}
```

## Rejected variants

```rx
-- types: TS2322
fn first<T>(xs: T[]): T => xs[0]
export default component App() {
  n: number = first(["a"])
  <p>{n}</p>
}
```

```rx
-- types: TS2345
fn pluck<T, K extends keyof T>(xs: T[], k: K): T[K][] => map(xs, (x) => x[k])
export default component App() { <p>{pluck([{ a: 1 }], "b")}</p> }
```

```rx
-- types: TS2304
fn f(x: T): T => x
export default component App() { <p>{f(1)}</p> }
```

```rx
-- types: TS2322
fn createKept<T>(ref x: T): T {
  y: string = x
  x
}
export default component App() {
  v = createKept("a")
  <p>{v}</p>
}
```

In the body, what `T` is is the caller's to say, and an equation of it is not held to R-1a; the caller's equation is:

```rx
-- types: MISSING_AWAIT
import { ask } from "./api"
fn createHeld<T>(ref x: T): T {
  now = x
  now
}
export default component App() {
  h = createHeld(ask("a"))
  errored fallback(e) { <p>e</p> } { loading fallback { <p>l</p> } { <p>{str(h)}</p> } }
}
```

A source seeded with one says its type, as nothing else tells what a later write may be:

```rx
-- types: TS2345
fn createKept<T>(ref x: T): T {
  source kept := peek x
  action back() { kept := peek x }
  kept
}
export default component App() {
  v = createKept("a")
  <p>{v}</p>
}
```

A type parameter is no value, and a snapshot is one whatever its type:

```rx
-- reject: UNBOUND
fn f<T>(x: T) => T
export default component App() { <p>{f(1)}</p> }
```

```rx
-- reject: SNAPSHOT_ARGUMENT
fn createBox<T>(ref n: number, v: T): T[] {
  out = [v, v]
  out
}
export default component App() {
  source a := 1
  b = createBox(a, a)
  <p>{len(b)}</p>
}
```

```rx
-- reject: PARSE
fn f<T(x: T) => x
export default component App() { <p>{f(1)}</p> }
```
