# 08 — `draft`: a value the library hands out to be changed

## Problem

Solid's store setter takes a callback that changes a draft. `.rx` cannot write one.

<!-- check branch=WRITE_TO_NON_SOURCE upstream=WRITE_TO_NON_SOURCE -->
```rx
import { makeStore } from "./store.js"
export default component App() {
  [s, set] = makeStore({ n: 1 })
  <button onClick={() => { set((d) => { d.n := d.n + 1 }) }}>{s.n}</button>
}
-- file: ./store.d.rx
export pure fn makeStore(v: any): [any, (update: (state: any) => void) => void] instantiates
```

## Proposal

- A declaration marks a callback's parameter `draft`. In the closure, a path of it is written with `:=`.

<!-- check branch=ok upstream=PARSE -->
```rx
import { makeStore } from "./store.js"
export default component App() {
  [s, set] = makeStore({ n: 1 })
  <button onClick={() => { set((d) => { d.n := d.n + 1 }) }}>{s.n}</button>
}
-- file: ./store.d.rx
export pure fn makeStore<T>(v: T): [T, (update: (draft state: T) => void) => void] instantiates
```

- **A draft is a place, not a value.** Its name stands only in its own callback. A read of it, kept, is a copy. The
  function that hands it out is called by its own name, with the callback written in the call. A closed list of methods of
  plain data may be called on it. Anything else is `DRAFT_ESCAPES`:

<!-- check branch=DRAFT_ESCAPES upstream=PARSE -->
```rx
import { makeStore } from "./store.js"
export default component App() {
  source kept: any := null
  [s, set] = makeStore({ n: 1 })
  <button onClick={() => { set((d) => { kept := () => d.n }) }}>{s.n}</button>
}
-- file: ./store.d.rx
export pure fn makeStore<T>(v: T): [T, (update: (draft state: T) => void) => void] instantiates
```

- **A fn's parameter** may be `draft`: the JS fn changes it in place during the call and keeps nothing. It is given a
  draft, or a value the code made itself; a source's value is `MUTATION_IN_PLACE`
  ([09](09-silent-mistakes.md)). A parameter with no word is lent a copy, which a development build freezes.

## Evidence

`node proposals/words.mjs draft`: 4 rows in 2 programs. Taken off: both refused, 8 mistakes accepted.

This is thin, and it is stated so:

- The callback form has one library behind it, `solid-js` itself (`createStore`).
- The parameter form has the app's own array helpers. `rx-declare` proves it from code in 9 rows of 193 drafts.
- `.rx` already has structured sources with path writes. The word is for a store a library or a module of JavaScript owns.

## Cost

- About 1,270 lines in the crate, 520 in `ref/src`, 100 in the emitters, over seven commits, which also hold
  [06](06-accessors-that-wait.md)'s confinement (c397484, 2e77595, 4a7749e, 63c3332, 43e172e, b4eeb2a, 3689f08). It is the
  largest checker change here for the fewest programs.
- A run-time copy where a draft is read and kept.
- Hard to learn: the three rules above, and the list of methods.

## What it does not do

- It says nothing about class instances in a store.
- It does not let the callback's name travel, save for a closure bound by name and used only there.

## Alternatives tried and rejected

- *A draft as a value, with an analysis of where it goes.* Reviewed three times; each review found a way out (an alias, a
  record, an iterator kept, `[f][0]()`). The place rule replaced it.
- *Copy the draft into each call of JavaScript, in silence.* A helper that sorts in place then did nothing, with no error.
- *A module of JavaScript for each store helper.* It works upstream today, with no word:

<!-- check branch=ok upstream=ok -->
```rx
import { makeStore } from "./store.js"
import { inc } from "./app.js"
export default component App() {
  [s, set] = makeStore({ n: 1 })
  <button onClick={() => { set(inc) }}>{s.n}</button>
}
-- file: ./store.d.rx
export pure fn makeStore(v: any): [any, (update: (state: any) => void) => void] instantiates
```

## Compatibility

None: a path write to a parameter was refused.

## Open questions

- Is `createStore` wanted in `.rx` at all? If a structured source is the answer, drop this proposal.
- If only `createStore` matters, its rule could be the language's, and not a word.

## Prototype

MO-10i, MO-10k. S-module-25. Commits above.
