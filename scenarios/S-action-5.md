# S-action-5 — an action handed back by a fn is an action wherever it is called

Rules: R-io-3, IO-2, SC-4, RG-6, MO-9b.

## Modules

```rx
-- module: ./page.rx
export type Page = { page: number; set: (n: number) => void; pair: [number, (n: number) => void]; label: (n: number) => string }
export fn createPage(first: number): Page {
  source page := first
  action set(n: number) { page := n }
  { page: page, set: set, pair: [page, set], label: (n: number) => "p" + n }
}
export fn createFlag(): [boolean, () => void] {
  source lit := false
  action toggle() { lit := v => !v }
  [lit, toggle]
}
export main = createPage(7)
```

The printed signature says what each part of a result is (`: { page: ref; set: io; pair: [ref, io]; label: value }`, MO-13i).

## Program

```rx
import { createPage, createFlag, main } from "./page.rx"
component Pager() {
  p = createPage(1)
  [page, turn] = p.pair
  [lit, toggle] = createFlag()
  <button onClick={() => { p.set(2); turn(3); toggle(); main.set(8) }}>{p.page} {page} {p.label(1)} {lit ? "on" : "off"} {main.page}</button>
}
export default component App() {
  source go := 0
  go2 = main.set
  <div><Pager /><i onClick={() => { go2(9) }}>{go}</i></div>
}
```

A call in a handler is accepted, by any name; and a function beside the actions that reads (`label`) is called anywhere.

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `1 1 p1 off 70` |
| 1 | handler `p.set(2); toggle(); go2(8)` | `2 2 p1 on 80` |
| 2 | handler `turn(3)` | `3 3 p1 on 80` |

## Rejected variants

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
import { createPage } from "./page.rx"
export default component App() {
  p = createPage(1)
  <p>{p.set(2)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
import { createFlag } from "./page.rx"
export default component App() {
  [lit, toggle] = createFlag()
  <p>{toggle()} {lit}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
import { main } from "./page.rx"
export default component App() { <p>{main.pair[1](2)}</p> }
```

A fn declared below its call, and one that hands on another's:

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  m = outer()
  x = m.inner
  <p>{x.set(1)}</p>
}
fn outer() {
  i = mk()
  { inner: i }
}
fn mk() {
  source n := 0
  action set(v: number) { n := v }
  { n: n, set: set }
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
import { createPage } from "./page.rx"
export default component App() {
  p = createPage(1)
  <button onClick={p.set(2)}>{p.page}</button>
}
```

```rx
-- reject: IO_IN_FN
import { createPage } from "./page.rx"
fn useFirst() {
  p = createPage(1)
  x = p.set(2)
  x
}
export default component App() { x = useFirst()
  <p>{x}</p> }
```

A field written over the action is not one, nor is what the checker cannot follow (a parameter):

```rx
-- accept
import { createPage } from "./page.rx"
fn over(extra: any) {
  p = createPage(1)
  { ...p, set: (n: number) => "s" + n, other: extra }
}
export default component App() {
  o = over((n) => n)
  <p>{o.set(1)} {o.other(1)} {o.label(2)}</p>
}
```
