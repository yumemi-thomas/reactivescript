# S-types-2 — a type is TypeScript's where one is written

Rules exercised: 07 §2, 13 TY-1, MO-9b.

## Modules

```rx
-- module: ./kit.rx
export fn make(start: {
  n: number
  step?: (x: number) => number
}): { n: number; next: () => number } {
  { n: start.n, next: () => start.step ? start.step(start.n) : start.n + 1 }
}
export fn later(a: number): () => number => () => a
export fn joiner(sep: string): (a: string, b?: string) => string { (a, b) => b == undefined ? a : a + sep + b }
export fn either(a: number): number | { over: number } => a > 1 ? { over: a } : a
export fn twice(f: (x: number) => number, x: number): number => f(f(x))
```

A result type's record and function are read where a type begins; the `{` and the `=>` after it are the body's, as in
TypeScript. A parameter's, a source's, an equation's and a local's are read to their end.

## Program

```rx
import { make, later, joiner, either, twice } from "./kit.rx"
export default component App() {
  source n := 2
  inc: (x: number) => number = (x) => x + 1
  source box: { get: () => number } := { get: () => 7 }
  m = make({ n: n, step: inc })
  join = joiner("-")
  one = either(n)
  <p onClick={() => { let f: (x: number) => number = (x) => x; n := f(3) }}>{m.n} {m.next()} {later(n)()} {join("a", "b")} {str(one)} {twice(inc, n)} {box.get()}</p>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `2 3 2 a-b {"over":2} 4 7` |
| 1 | handler `n := 1` | `1 2 1 a-b 1 3 7` |

## Rejected variants

```rx
-- types: TS2322
fn k(): { a: number } { { a: "x" } }
export default component App() { <p>{k().a}</p> }
```
