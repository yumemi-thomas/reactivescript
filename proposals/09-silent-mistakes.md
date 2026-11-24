# 09 — Five mistakes that are accepted and do nothing, or do the wrong thing

Five static checks. They need no declaration, and each can be taken alone. Order: by how often the mistake is made.

## Problem and proposal

**`MUTATION_IN_PLACE`** (W-1a). An `Array`'s mutating method (`push`, `sort`, `reverse`, `splice`, …) called on the value of
a source, an equation, a prop, a provision, or a row of one. Solid ignores the write, with a console message in
development; `sort` in a view answers the list unsorted.

<!-- check branch=MUTATION_IN_PLACE upstream=ok -->
```rx
export default component App() {
  source xs: number[] := [3, 1]
  <button onClick={() => { xs.push(4) }}>{len(xs)}</button>
}
```

Run on upstream, the click leaves `2`:

<!-- frames branch=refused upstream=fail says-upstream="STORE_WRITE_OUTSIDE_SETTER" -->
```rx
export default component App() {
  source xs: number[] := [3, 1]
  <button onClick={() => { xs.push(4) }}>{len(xs)}</button>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `2` |
| 1 | handler `xs.push(4)` | `3` |

A list the code made itself (`[...xs].sort()`, a literal) is its own, and accepted.

**`DISPOSER_DROPPED`** (EF-5a). A call in an effect whose declared answer is a function of nothing, written as a statement:
what undoes it is lost.

<!-- check branch=DISPOSER_DROPPED upstream=ok -->
```rx
import { onKey } from "./keys.js"
export default component App() {
  source n := 0
  effect (n) { onKey("a", () => { log("a") }) }
  <p>{n}</p>
}
-- file: ./keys.d.rx
export fn onKey(k: string, f: () => void): () => void
```

`return onKey(…)` is the fix.

**`DUPLICATE_KEY`** (ST-4d). A keyed list written out with two rows of one key. Rows from data are named on the console by a
development build.

<!-- check branch=DUPLICATE_KEY upstream=ok -->
```rx
export default component App() {
  source rows key id := [{ id: 1, t: "a" }, { id: 1, t: "b" }]
  <ul>{for r in rows { <li>{r.t}</li> }}</ul>
}
```

**`GUESS_OUTSIDE_HOLD`, for a run that starts nothing to wait for** (AC-3). The guess is taken back in the instant it is made.

<!-- check branch=GUESS_OUTSIDE_HOLD upstream=ok -->
```rx
export default component App() {
  source name := "Ann"
  source shown = name
  <button onClick={() => { guess shown := "Zed" }}>{shown}</button>
}
```

**`EFFECT_RELAY_TEAR`** (C-3a). An effect writes a source beside it with a value computed from what it fired for. Upstream's 99 lists it and
says it *stays advisory*. Here it is an error.

<!-- check branch=EFFECT_RELAY_TEAR upstream=ok -->
```rx
export default component App() {
  source a := 1
  source b := 0
  effect (a) { b := $0 * 2 }
  <p>{a} {b}</p>
}
```

The tear, run on upstream: the frame `2 2` shows an `a` beside another `a`'s `b`.

<!-- frames branch=refused upstream=pass -->
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

A constant, what an io call answers, a reading under `peek` and a source of an outer block stay accepted.

## Evidence

- In upstream's repository, `EFFECT_RELAY_TEAR` is found in 3 programs written by models in `eval/results` (5 modules):
  `board-rx-haiku-1`, `board-rx-haiku-2`, `desk9-rx-haiku-5`. The last is accepted upstream today
  (`src/Help.rx:14`, `effect (props.seedQuery) { query := $0 }`). The other four checks find nothing there.
- The benchmark has a task for each, written as the mistake is made: `source-mutation`, `listener-cleanup`,
  `duplicate-keys`, `optimistic-todo`, `effect-derived` (`bench/scorecard.txt`, all caught).
- No count of these mistakes in real programs was made, other than the first line.

## Cost

| check | crate | `ref/src` |
| --- | --- | --- |
| `MUTATION_IN_PLACE`, `DISPOSER_DROPPED` | 98 | 47 (3202a8d) |
| `DUPLICATE_KEY` | 54 | 37 (ce28f0b, with a fix) |
| `EFFECT_RELAY_TEAR` | 291 | 106 (f333b5d, with statements' lines) |

`MUTATION_IN_PLACE` must know which names hold a value the code made. A wrong answer refuses a correct sort.

## What it does not do

- A mutation through a helper of JavaScript is not seen ([08](08-draft.md)'s `draft` parameter sees it).
- A method called by a computed key is not seen.

## Alternatives tried and rejected

- *`EFFECT_RELAY_TEAR` as advice.* It was, for a time. Nothing refused the program, and the first run of models wrote it.
- *`DISPOSER_DROPPED` from a generated row.* Not asked there: it is read off a type alone.

## Compatibility

Each refuses programs accepted today. In upstream's 305 modules: one program (two modules) goes from accepted to refused,
by `EFFECT_RELAY_TEAR`.

## Open questions

- `Help.rx` copies a prop into a source that the user then edits. `source query := peek props.seedQuery` is another
  program: it does not follow the prop. Is `source query = props.seedQuery` (ST-5) what the author meant?
- So: error, or advice as 99 says?

## Prototype

S-check-1, 2, 3. Commits above, and d388410 (the guess).
