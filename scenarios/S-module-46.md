# S-module-46 — `fetch` and `fail` are the scenario prelude's, not an app's

Rules: 11 CP-4c, MO-1d.

A scenario is a conformance build: `fetch` is a test flight and `fail` a panic, with no import. An app has neither (`-- app`):
until 2026-11-24 both checkers took them there, and the compiled app called the harness.

## Program

```rx
export default component App() {
  source n := 0
  a = await fetch("k")
  errored fallback(e) { <p>{e.message}</p> } {
    <p onClick={() => { n := n + 1 }}>{a} {n > 0 ? fail("over") : n}</p>
  }
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `` |
| 1 | resolve "k" "asked" | `asked 0` |
| 2 | handler `n := 1` | `over` |

## Rejected variants

```rx
-- reject: UNBOUND
-- app
export default component App() {
  <button onClick={() => { fetch("/x") }}>go</button>
}
```

```rx
-- reject: UNBOUND
-- app
export default component App() {
  source n := 0
  <p>{n > 0 ? fail("over") : n}</p>
}
```

As JavaScript's other globals, in a scenario too:

```rx
-- reject: UNBOUND
export default component App() {
  <button onClick={() => { setTimeout(() => 1, 5) }}>go</button>
}
```

Bound, each is its binding:

```rx
-- accept
import { fetch } from "./lib.js"
fn fail(x: number): string => `fine ${x}`
export default component App() {
  <button onClick={() => { fetch("/x") }}>{fail(1)}</button>
}
```
