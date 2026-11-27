# S-check-10 — a caller, and a source, are followed as an io value is (R-io-3e, R-io-3f)

Rules exercised: R-io-3, R-io-3d, R-io-3e, R-io-3f, SC-3, SC-4, W-5, W-6.

Two more facts follow a value. Where it holds a *caller* — a function that calls what it is given — and the call that
reaches that caller hands it an io value, the io value is called while the view computes. And a source holds what the
module gives it: its initializer and every write. Table code is untouched: a `render` that calls nothing of its row is
no caller, whatever the rows hold.

## Program

```rx
fn first(fs: ((r: { label: string }) => string)[], g: { label: string }): string => fs[0](g)
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  action dec() { n := n - 1 }
  source hs: (() => void)[] := [inc]
  source fmt: (v: number) => string := (v: number) => `#${v}`
  items = [{ label: "a", go: inc }, { label: "b", go: dec }]
  cols = [{ render: (r: { label: string }) => r.label + "!" }, { render: (r: { label: string }) => r.label.toUpperCase() }]
  x = first([(r: { label: string }) => r.label], items[0])
  <p>{fmt(n)} {x}</p>
  {for row in items { for col in cols.toReversed() { <i>{col.render(row)}</i> } }}
  {for f in hs { <button onClick={f}>f</button> }}
  <button onClick={() => { hs := (v: (() => void)[]) => [...v, dec] }}>more</button>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `#0 aAa!Bb!fmore` |
| 1 | handler `hs[0]()` | `#1 aAa!Bb!fmore` |
| 2 | handler `items[1].go()` | `#0 aAa!Bb!fmore` |
| 3 | handler `hs[0]()` | `#1 aAa!Bb!fmore` |

## Rejected variants

A caller kept in a list or a record, handed an io value by a fn that is only given both.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn all(fs: ((h: () => void) => void)[], g: () => void): void => fs[0](g)
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  x = all([(h: () => void) => h()], inc)
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn all(t: { run: (h: () => void) => void, g: () => void }): void => t.run(t.g)
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  x = all({ run: (h: () => void) => h(), g: inc })
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn callIt(h: () => void): void => h()
fn all(fs: ((h: () => void) => void)[], g: () => void): void[] => fs.map((f: (h: () => void) => void) => f(g))
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  x = all([callIt], inc)
  <p>{n} {len(x)}</p>
}
```

A callee no form says the inside of: what a fn answers, an item a method answers, a row of a mapped list.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn pick(fs: ((h: () => void) => void)[]): (h: () => void) => void => fs[0]
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  cs = [(h: () => void) => h()]
  x = pick(cs)(inc)
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  cs = [(h: () => void) => h()]
  x = cs.at(0)(inc)
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  items = [{ label: "a", go: inc }]
  cols = [{ render: (r: { go: () => void }) => r.go() }]
  <p>{n}</p>
  {for row in items { for col in cols.toReversed() { <i>{str(col.render(row))}</i> } }}
}
```

A parameter nothing binds, called with a value that holds io by itself.

```rx
-- reject: IO_IN_FN
source n := 0
action inc() { n := n + 1 }
fn hand(f: (h: () => void) => void): void => f(inc)
export default component App() {
  x = hand((h: () => void) => h())
  <p>{n} {str(x)}</p>
}
```

A source holds what it is given: its initializer, a write, what an action's parameter is given.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  source h: () => void := inc
  x = h()
  <p>{n} {str(x)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  source hs: (() => void)[] := []
  action arm() { hs := (v: (() => void)[]) => [...v, inc] }
  <p>{n}</p>
  {for f in hs { <i>{str(f())}</i> }}
  <button onClick={arm}>arm</button>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  source h: (() => void) | null := null
  action arm(f: () => void) { h := () => f }
  x = h === null ? 0 : h()
  <p>{n} {str(x)}</p>
  <button onClick={() => { arm(inc) }}>arm</button>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  source c: (h: () => void) => void := (h: () => void) => h()
  x = c(inc)
  <p>{n} {str(x)}</p>
}
```
