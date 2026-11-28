# S-locals-1 — a fn that names a value

Rules exercised: E-9b, E-9, E-2, E-3, E-7, E-11, E-12, R-1.

A fn whose body only names values (`half = w / 2`) is one expression over its parameters, written in parts. Its call is lifted, as
the one-line form's is: it is an equation over its arguments, it may stand anywhere an expression may, and it makes nothing.

## Modules

```rx
-- module: ./lib.rx
import { log } from "./prelude"
export fn area(w: number, h: number): number {
  half = w / 2
  half * h
}
export fn noted(tag: string, n: number): number => n
```

`export pure fn area(w: number, h: number)`: no `instantiates`; to JavaScript it is the function (MO-13f).

## Program

```rx
import { area } from "./lib.rx"
error Bad(n: number) => `bad ${n}`
source scale := 10
fn read(a: number): number {
  b = c + 1
  c = a * 2
  b
}
fn check(n: number): number => n > 2 ? throw Bad(n) : n
fn guarded(n: number): string {
  unused = check(99)
  ok = check(n)
  n > 2 ? "big" : `ok ${ok}`
}
fn fact(n: number): number {
  rest = fact(n - 1)
  n <= 1 ? 1 : n * rest
}
fn scaled(xs: number[], by: number): number[] {
  k = by * scale
  map(xs, (x: number) => x * k)
}
fn both(n: number): { pair: { n: number }[]; same: boolean } {
  o = { n: n }
  { pair: [o, o], same: o == o }
}
export default component App() {
  source a := 4
  n = read(a)
  action up() { a := x => x + 1 }
  action down() { a := 1 }
  action wide() { scale := 100 }
  act = () => area(a, 2)
  errored fallback(e) { <p>{e.message}</p> } {
    <p>{area(a, 2)} {n} {guarded(a)} {fact(a)} {scaled([1, a], 2).join("/")} {both(a).same ? "same" : "not"} {a > 1 ? area(area(a, 2), 1) : 0} {act()}</p>
  }
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `4 9 big 24 20/80 same 2 4` |
| 1 | handler `up()` | `5 11 big 120 20/100 same 2.5 5` |
| 2 | handler `wide()` | `5 11 big 120 200/1000 same 2.5 5` |
| 3 | handler `down()` | `1 3 ok 1 1 200/200 same 0 1` |

`read` names `b` before `c` (E-7). `guarded` never evaluates `unused`, and `ok` only in the arm that reads it (E-3, E-11): `check`
throws for both. `fact` ends, since `rest` is not evaluated where it is not read. `scaled` reads a source of the module through a
name read in a closure, and follows it; `o` is one value, read three times.

## Variant: a pending answer and a failure are the caller's

```rx
import pure { ask } from "./api"
error Bad(n: number) => `bad ${n}`
fn pick(a: number, b: number, take: boolean): number {
  x = a + 1
  y = b > 0 ? b : throw Bad(b)
  take ? x : x + y
}
export default component App() {
  source q := "a"
  source b := 0
  source take := true
  one = await ask(q)
  errored fallback(e) { <p>failed {e.message}</p> } {
    loading fallback { <p>...</p> } {
      <p>{pick(one, b, take)}</p>
    }
  }
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `...` |
| 1 | resolve "ask:a" 5 | `6` |
| 2 | handler `take := false` | `failed bad 0` |
| 3 | handler `b := 2` | `8` |

## Variant: a closure handed back reads what it names when it is called

```rx
source n := 1
fn teller(tag: string): () => string {
  t = `${tag}${n}`
  () => t
}
fn late(a: number): number {
  h = n * a
  (peek h) + h
}
export default component App() {
  tell = teller("n")
  source said := ""
  action up() { n := x => x + 1 }
  action say() { said := tell() }
  <p>{tell()} {said} {late(10)}</p>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `n1  20` |
| 1 | handler `up()` | `n2  40` |
| 2 | handler `say()` | `n2 n2 40` |
| 3 | handler `up()` | `n3 n2 60` |

The closure reads `n` each time it is called, as `() => ...n` written out would; and a name read first under `peek` is still an input
where it is read without.

## Accepted variants

A bound call is lifted too, and follows its arguments:

```rx
-- accept
fn area(w: number, h: number): number { half = w / 2
  half * h }
export default component App() { source a := 1
  x = area(a, 2)
  <p onClick={() => { a := area(a, 2) }}>{x}</p> }
```

```rx
-- accept
fn pos(p: { x: number; y: number }): string { { x, y } = p
  ys: string = str(y)
  `${x},${ys}` }
export default component App() { <p>{pos({ x: 1, y: 2 })}</p> }
```

A body that declares more than a name for a value is an instantiation still:

```rx
-- accept
fn createDouble(a: number): number { source n := a
  d = n * 2
  d }
fn createFour(a: number): number { d = createDouble(a)
  d * 2 }
export default component App() { x = createFour(1)
  <p>{x}</p> }
```

## Rejected variants

```rx
-- reject: INSTANTIATION_NOT_BOUND
fn createDouble(a: number): number { source n := a
  d = n * 2
  d }
fn createFour(a: number): number { d = createDouble(a)
  d * 2 }
export default component App() { <p>{createFour(1)}</p> }
```

```rx
-- reject: INSTANTIATION_NOT_BOUND
import pure { ask } from "./api"
fn one(a: string): number { r = await ask(a)
  r + 1 }
export default component App() { loading fallback { <p>...</p> } { errored fallback(e) { <p>x</p> } { <p>{one("a")}</p> } } }
```

```rx
-- reject: INSTANTIATION_NOT_BOUND
fn last(a: number): number { p = pre a -> 0
  p }
export default component App() { source n := 1
  <p>{last(n)}</p> }
```

```rx
-- reject: INSTANTIATION_NOT_BOUND
context c: number = 1
fn read(a: number): number { v = use c
  v + a }
export default component App() { <p>{read(1)}</p> }
```

```rx
-- reject: C-1
fn f(a: number): number { x = y + a
  y = x
  y }
export default component App() { <p>{f(1)}</p> }
```

```rx
-- reject: DUPLICATE_DECLARATION
fn f(a: number): number { x = a
  x = a
  x }
export default component App() { <p>{f(1)}</p> }
```

```rx
-- reject: UNBOUND
fn f(a: number): number { x = a + nope
  a }
export default component App() { <p>{f(1)}</p> }
```

```rx
-- reject: IO_IN_FN
import { save } from "./api"
fn f(a: number) { x = save(a)
  x }
export default component App() { <p>{f(1)}</p> }
```

```rx
-- reject: UNHANDLED_FAILURE
error Bad => "bad"
fn pick(a: number): number { x = a > 0 ? a : throw Bad()
  x }
export default component App() { <p>{pick(1)}</p> }
```

```rx
-- types: TS2322
fn f(a: number): string { x = a + 1
  x }
export default component App() { <p>{f(1)}</p> }
```
