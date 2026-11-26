# S-check-6 — a value that holds io, followed into lists, records, closures, `for` rows and fns

Rules exercised: R-io-3, IO-2, MO-9b.

An action carried in a list or a record is carried, not called (R-io-3). Where what it is carried into calls it while
the view computes, it is called there: a closure given to a calling method of the language over the list (its
parameter holds what an item holds), a `for` row in a view, a fn whose body calls that path of its parameter — through a
second and a third fn, and from another module by its printed row (`export pure fn runAll(fs: any[]) calls(fs.*)`). Each
was accepted before and stopped by Solid's development build at mount (`ACTION_CALLED_IN_OWNED_SCOPE`); production ran
the action in the view (the roadmap's W2, 2026-11-26). In a handler the same code is a call in an io scope.

## Modules

```rx
-- module: ./lib.rx
export fn runAll(fs: any[]) => len(fs.map((f) => f()))
export fn pick(r: any) => r.go()
export fn count(fs: any[]) => len(fs)
```

## Program

```rx
import { runAll, count } from "./lib.rx"
fn each(fs: any[]) => len(fs.map((f) => f()))
fn keep(fs: any[]) => fs
export default component App() {
  source n := 0
  source shown := ""
  action inc() { n := n + 1 }
  fs = [inc]
  box = { go: inc }
  kept = len(keep(fs))
  twice = [(x: number) => x * 2].map((g) => g(3))
  <p>{kept}{twice[0]}{count(fs)}{n}{shown}</p>
  <button onClick={() => { shown := `${each(fs)}${runAll([box.go])}` }}>a</button>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `1610a` |
| 1 | handler `shown := "x"` | `1610xa` |

The handlers run the same code the rejected variants run in the view; here it is an io scope, so it is a call. (The
frame's button is `a`.)

## Rejected variants

A closure given to a calling method, over a list that holds an action.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  y = [inc].map((g) => g())
  <p>{len(y)}{n}</p>
}
```

A `for` row.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  fs = [inc]
  <ul>{for g in fs { <li>{str(g())}</li> }}</ul>{n}
}
```

A field of each item, through a spread and a filter.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  base = [{ go: inc }]
  y = [...base].filter((r) => true).map((r) => r.go())
  <p>{len(y)}{n}</p>
}
```

A fn that calls each item, reached through two more.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn callIt(g: any) => g()
fn run(fs: any[]) => len(fs.map((f) => callIt(f)))
fn run2(fs: any[]) => run(fs)
fn run3(fs: any[]) => run2(fs) + 0
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  y = run3([inc])
  <p>{y}{n}</p>
}
```

A fn that calls a field of a record.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn go(r: any) => r.go()
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  y = str(go({ go: inc }))
  <p>{y}{n}</p>
}
```

A fn of another module, by its printed row.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
import { runAll } from "./lib.rx"
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  y = runAll([inc])
  <p>{y}{n}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
import { pick } from "./lib.rx"
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  y = str(pick({ go: inc }))
  <p>{y}{n}</p>
}
```

An item given by name to a fn that calls it.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn callIt(g: any) => g()
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  y = [inc].map(callIt)
  <p>{len(y)}{n}</p>
}
```

A handler a component is given, in a list it calls (proposals/31's leftovers).

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
component Part(p: { onPick: (v: number) => void }) {
  <b>{len([p.onPick].map((f) => f(1)))}</b>
}
export default component App() {
  source n := 0
  <Part onPick={(v: number) => { n := v }} />{n}
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
component Part(p: { onPick: (v: number) => void }) {
  <ul>{for f in [p.onPick] { <li>{str(f(1))}</li> }}</ul>
}
export default component App() {
  source n := 0
  <Part onPick={(v: number) => { n := v }} />{n}
}
```
