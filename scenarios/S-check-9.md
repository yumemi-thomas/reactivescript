# S-check-9 — an io value is followed through every form (R-io-3d)

Rules exercised: R-io-3, R-io-3d, SC-3, SC-4.

What a value holds is a fact about the value: a form the checkers read keeps the paths, any other form gives the value
everything it was made from. Carrying is free; a call while the view computes is refused, in whatever form its callee is
written.

## Program

```rx
fn pick(xs: (() => void)[]): () => void => xs[0]
fn total(rs: { price: number }[]): number => sum(map(rs, (r: { price: number }) => r.price))
export default component App() {
  source n := 0
  source a := 3
  action inc() { n := n + 1 }
  fs = [() => { n := n + 1 }, () => { n := n + 10 }]
  items = [{ label: "a", price: 2, go: inc }, { label: "b", price: 3, go: inc }]
  cols = [{ render: (r: { label: string }) => r.label + "!" }]
  h = pick(fs)
  later = fs.filter((f: () => void) => true).concat([inc])
  <p>{n} {len(fs)} {(items.find((i: { label: string }) => i.label === "b") ?? items[0]).label.toUpperCase()} {total(items).toFixed(1)} {cols[0].render(items[0])}</p>
  <button onClick={h}>h</button>
  {for g in later { <button onClick={g}>g</button> }}
  <button onClick={() => { (a > 2 ? fs[0] : fs[1])() }}>c</button>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `0 2 B 5.0 a!hgggc` |
| 1 | handler `h()` | `1 2 B 5.0 a!hgggc` |
| 2 | handler `later[1]()` | `11 2 B 5.0 a!hgggc` |
| 3 | handler `later[2]()` | `12 2 B 5.0 a!hgggc` |

## Rejected variants

A choice, an item a method answers, a default, a spread, a copy: the callee is read in whatever form it is written.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  source a := 3
  fs = [() => { n := n + 1 }, () => { n := n + 10 }]
  x = (a > 2 ? fs[0] : fs[1])()
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  action dec() { n := n - 1 }
  source a := 3
  x = (a > 2 ? inc : dec)()
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  fs = [() => { n := n + 1 }]
  x = fs.at(0)()
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  fs = [() => { n := n + 1 }]
  x = (fs[5] ?? fs[0])()
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  fs = [() => { n := n + 1 }]
  x = [...fs][0]()
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  source i := 0
  fs = [() => { n := n + 1 }]
  x = fs[i]()
  <p>{n} {str(x)}</p>
}
```

A form that is not read: what a fn answers of what it was given, a method in no list.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn pick(xs: (() => void)[]): () => void => xs[0]
export default component App() {
  source n := 0
  fs = [() => { n := n + 1 }]
  x = pick(fs)()
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  fs = [() => { n := n + 1 }]
  x = fs.reduce((acc: () => void, f: () => void) => f)()
  <p>{n} {str(x)}</p>
}
```

A closure answers what its body holds; a closure the module writes calls what its body calls.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  mk = () => inc
  x = mk()()
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  fs = [() => { n := n + 1 }]
  t = { run: (xs: (() => void)[]) => xs[0]() }
  x = t.run(fs)
  <p>{n} {str(x)}</p>
}
```

A fn that calls a path of its parameter through a choice; a closure given beside an io value, which the fn may hand it.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn run(xs: (() => void)[], a: number): number {
  r = (a > 2 ? xs[0] : xs[1])()
  1
}
export default component App() {
  source n := 0
  fs = [() => { n := n + 1 }, () => { n := n + 10 }]
  x = run(fs, n)
  <p>{n} {x}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn each(f: (h: () => void) => void, g: () => void): void => f(g)
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  x = each((h: () => void) => h(), inc)
  <p>{n} {str(x)}</p>
}
```
