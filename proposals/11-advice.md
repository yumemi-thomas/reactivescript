# 11 — Two advisory rows

Needs nothing. Both are *advice* (99): printed, and the program is accepted. They were errors in the prototype; the review showed correct programs refused, and 99's ruling is kept.

**`EFFECT_RELAY_TEAR`** — upstream's 99 lists it: *"an equation written the long way, with a one-instant tear, but also how a source is synced into a JS-owned one — stays advisory."* No
checker of upstream reports it. An effect writes a source beside it with a value computed from what it fired for:

<!-- check branch=ok upstream=ok says-branch="advice EFFECT_RELAY_TEAR" -->
```rx
export default component App() {
  source a := 1
  source b := 0
  effect (a) { b := $0 * 2 }
  <p>{a} {b}</p>
}
```

The tear, run on both: the frame `2 2` shows an `a` beside another `a`'s `b`.

<!-- frames branch=pass upstream=pass -->
```rx
export default component App() {
  source a := 1
  source b := 0
  effect (a) { b := $0 * 2 }
  <p>{a} {b}</p>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `1 0` |
| 1 | (effect) | `1 2` |
| 2 | handler `a := 2` | `2 2` |
| 3 | (effect) | `2 4` |

**`DISPOSER_DROPPED`** — a call whose declared answer is a function of nothing, written as a statement. The type does not say that the function undoes anything, so it cannot be an error:

<!-- check branch=ok upstream=ok says-branch="advice DISPOSER_DROPPED" -->
```rx
import { builder } from "./calc.js"
export default component App() {
  effect () { builder() }
  <p>ok</p>
}
-- file: ./calc.d.rx
export fn builder(): () => void
```

**Evidence.** `EFFECT_RELAY_TEAR` is found in 3 programs of upstream's `eval/results` (5 modules), written by models. Benchmark tasks have variants of both. No count of real programs.

**Cost.** 291 and 106 lines for the first (f333b5d, with statements' lines); the second is in [10](10-mutation-in-place.md)'s.

**Prototype.** C-3a, EF-5a (proposed ids). S-check-2, S-check-3.
