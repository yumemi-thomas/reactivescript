# S-check-2 — an effect writing its own source (C-3)

Rules: C-3, EF-5, ST-5.

A write in the apply block itself to a source the compute half reads is a
loop across instants and is refused. A write in a closure the apply creates
— here its cleanup — is a later event and is legal.

## Program

```rx
export default component App() {
  source n := 0
  effect (n) { log($0); return () => { n := 0 } }

  <p>{n}</p>
}
```

## Frames

| instant | action          | frame | effect   |
| ------- | --------------- | ----- | -------- |
| 0       | mount           | `0`   | log(0)   |
| 1       | handler `n := 5` | `5`  | log(5)   |
| 2       | (effect)        | `0`   | log(0)   |

Instant 1: the run for `0` is cleaned up before the run for `5`; its
cleanup writes `n := 0`, which opens instant 2 (EF-5, W-3).

## Rejected variants

```rx
-- reject: EFFECT_WRITES_OWN_SOURCE
export default component App() {
  source count := 0
  effect (count) { if ($0 > 10) count := 10 }

  <p>{count}</p>
}
```

Clamping in the apply: write `clamped = count > 10 ? 10 : count`, or clamp at
the write.

```rx
-- reject: EFFECT_WRITES_OWN_SOURCE
export default component App() {
  source items := [1, 2]
  source selected := 1
  valid = items.includes(selected)
  effect (valid) { if (!$0) selected := null }

  <p>{selected}</p>
}
```

Through an equation: `valid` reads `selected`. Derive the shown value
instead — `shown = valid ? selected : null` — or make `selected` a source
with a question over `items` (ST-5), which re-derives when `items` changes
and stays writable otherwise.

```rx
-- reject: EFFECT_WRITES_OWN_SOURCE
export default component App() {
  source n := 0
  effect (n) { try { n := n + 1 } catch (e) { } }

  <p>{n}</p>
}
```

Nested statements are still the apply's own.

```rx
-- reject: EFFECT_RELAY_TEAR
export default component App() {
  source qty := 1
  source total := 0
  effect () { total := qty * 5 }

  <p>{total}</p>
}
```

C-3a: `total` is computed from `qty`, which the effect does not take as an
input: once, when the effect is declared, and never again. It is the
equation `total = qty * 5`.

```rx
-- reject: EFFECT_RELAY_TEAR
export default component App() {
  source qty := 1
  source total := 0
  effect (qty) { total := $0 * 5 }

  <p>{total}</p>
}
```

The same with the input named: one frame shows the new `qty` beside the
old `total`, and the server never computes it.

```rx
-- reject: EFFECT_RELAY_TEAR
export default component App() {
  source n := 1
  source history := []
  effect (n) { let next = [...history, $0]; history := next }

  <p>{len(history)}</p>
}
```

Through a local, and building on its own value: `history = [...(pre
history -> []), n]`, or the write in the handler that changes `n`.

```rx
-- reject: EFFECT_RELAY_TEAR
export default component App() {
  source picked := 1
  source selected := {}
  effect (picked) { selected[str($0)] := true }

  <p>{selected["1"] ? "one" : "-"}</p>
}
```

A path computed from the input is derived too: the selection is a
projection of `picked` (ST-3, `selected = draft(pre selected -> {}) { … }`).

And what is not derived, accepted:

```rx
-- accept
import { measure } from "./dom"
source seen := 0
export default component App() {
  source n := 1
  source warned := false
  source visits := 0
  source width := 0
  source saved := 0
  effect (n) {
    if ($0 > 10) { warned := true }
    visits := visits + 1
    width := measure($0)
    saved := peek(n)
    seen := s => s + $0
  }

  <p>{warned ? "!" : ""}{visits} {width} {saved}</p>
}
```

What is not derived stays the apply's: a constant under a condition, the
source's own value, what an `io` call answers, a reading said to be taken
once, and a source of an outer block (`seen` is the module's: a component
that reports to it is one of its writers).
