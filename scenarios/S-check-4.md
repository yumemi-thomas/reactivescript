# S-check-4 — an action given by name to what calls it now

Rules exercised: R-io-3, IO-2, SC-2.

An action or an `io` value given by name is carried, not called (R-io-3). Where the callee calls it while the call runs,
it is called there: in reactive scope that is `ACTION_CALLED_IN_OWNED_SCOPE` (`IO_IN_REACTIVE` for another io value), as
its closure `(x) => inc(x)` is. Known to call now: the language's own methods and functions that call what they are
given, and a fn of the module whose body calls that parameter. A fn that keeps it, a prop, a context, a record, a
JavaScript import: it is carried, as before. (Accepted before, and stopped by Solid's development build: bugs/44.)

## Program

```rx
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  y = keep(inc)
  <p>{str(y == undefined)}{n}</p> }
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `false0` |

## Variant: a prop keeps it

```rx
component B(p: { onPick: (x: number) => void }) { <b onClick={() => { p.onPick(1) }}>b</b> }
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  <B onPick={inc} />{n} }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `b0` |

## Variant: a context carries it

```rx
context pick: (x: number) => void = (x) => undefined
component B() { f = use pick
  <b onClick={() => { f(1) }}>b</b> }
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  provide pick = inc
  <B />{n} }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `b0` |

## Variant: in a handler, a method that calls it is a call in an io scope

```rx
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  <p onClick={() => { [1, 2].map(inc) }}>{n}</p> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `0` |

## Variant: a fn of the module named as a method of the language, that keeps it

```rx
fn map(xs: number[], f: (x: number) => void): { f: (x: number) => void } => { f: f }
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  k = map([1], inc)
  <p onClick={() => { k.f(1) }}>{n}</p> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `0` |

## Accepted variants

```rx
-- accept
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  
  y = [1, 2].map(double)
  <p>{str(y == undefined)}{n}</p> }
```

```rx
-- accept
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  <p>{str(later(inc) == undefined)}{n}</p> }
```

```rx
-- accept
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  y = { go: inc }
  <p>{str(y == undefined)}{n}</p> }
```

```rx
-- accept
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  action go() { let y = [1, 2].map(inc) }
  <p onClick={go}>{n}</p> }
```

## Rejected variants

A method of the language.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  y = [1, 2].map(inc)
  <p>{str(y == undefined)}{n}</p> }
```

A function of the language, in a view.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  <p>{str(filter([1, 2], inc) == undefined)}{n}</p> }
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  action bump(x: number, i: number) { n := n + i }
  y = [1, 2].reduce(bump, 0)
  <p>{str(y == undefined)}{n}</p> }
```

A fn of the module that calls its parameter in a closure it gives to `map`.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  y = each([1, 2], inc)
  <p>{str(y == undefined)}{n}</p> }
```

… that gives it on by name.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  <p title={str(eachByName([1, 2], inc) == undefined)}>{n}</p> }
```

… that calls it.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn each(xs: number[], f: (x: number) => void): number => len(map(xs, (x) => f(x)))
fn eachByName(xs: number[], f: (x: number) => number): number => len(xs.map(f))
fn once(f: (x: number) => void): number => f(1) == undefined ? 1 : 0
fn keep(f: (x: number) => void): { go: (x: number) => void } => { go: f }
fn later(f: (x: number) => void): () => void => () => f(1)
fn second(a: number, f: (x: number) => void): number => a
fn double(x: number): number => x * 2
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  <p>{str(once(inc) == undefined)}{n}</p> }
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  ys = [[1], [2]].map((xs) => xs.map(inc))
  <p>{len(ys)}{n}</p> }
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn map(xs: number[], f: (x: number) => void): number => len(xs.filter((x) => f(x) == undefined))
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  k = map([1], inc)
  <p>{k}{n}</p> }
```

In a fn's body.

```rx
-- reject: IO_IN_FN
export default component App() { source n := 0
  action inc(x: number) { n := n + x }
  fn all(xs: number[]): number => len(xs.map(inc))
  <p>{all([1])}{n}</p> }
```
