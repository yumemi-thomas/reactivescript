# 05 — `handler`: a callback the library calls later

## Problem

A closure written in a declared call, where reactive state is made, is a pure function (SC-3). So a library's callback
cannot write a source in the place it is given.

<!-- check branch=REACTIVE_WRITE_IN_OWNED_SCOPE upstream=REACTIVE_WRITE_IN_OWNED_SCOPE -->
```rx
import { useMutation } from "./q.js"
export default component App() {
  source done := false
  m = useMutation({ onSuccess: () => { done := true } })
  <button onClick={() => { m.mutate(1) }}>{done ? "ok" : "go"}</button>
}
-- file: ./q.d.rx
export pure fn useMutation(options: { onSuccess?: () => void }): { mutate: (v: number) => void } instantiates
```

There is a way upstream today: an action, by its name.

<!-- check branch=ok upstream=ok -->
```rx
import { useMutation } from "./q.js"
export default component App() {
  source done := false
  action finish() { done := true }
  m = useMutation({ onSuccess: finish })
  <button onClick={() => { m.mutate(1) }}>{done ? "ok" : "go"}</button>
}
-- file: ./q.d.rx
export pure fn useMutation(options: { onSuccess?: () => void }): { mutate: (v: number) => void } instantiates
```

So the word is a convenience for the writer of the call. Its second use is a check: upstream accepts an action where the
library calls the function while a view computes. A row that says nothing cannot tell the two apart.

## Proposal

A declaration marks a function type `handler` where the library calls it later, outside any computation, as the DOM calls
an event handler: on a parameter, on a field of a record parameter, or on a declared component's prop.

<!-- check branch=ok upstream=REACTIVE_WRITE_IN_OWNED_SCOPE -->
```rx
import { useMutation } from "./q.js"
export default component App() {
  source done := false
  m = useMutation({ onSuccess: () => { done := true } })
  <button onClick={() => { m.mutate(1) }}>{done ? "ok" : "go"}</button>
}
-- file: ./q.d.rx
export pure fn useMutation(options: { onSuccess?: handler () => void }): { mutate: (v: number) => void } instantiates
```

- A closure written there is imperative scope (W-1, IO-2).
- A function type without the word is a pure function: safe however the library calls it.
- On a declared component, a function-typed prop is what its row says, whatever its name. The `on…` reading (SC-4) stays
  for elements, `.rx` components, and a prop no row types.

## Evidence

- `node proposals/words.mjs handler`: 39 rows in 31 programs. Taken off, 26 correct programs are refused, each
  `REACTIVE_WRITE_IN_OWNED_SCOPE`. That counts programs as they are written: an action's name would be accepted in the
  same places, and the 26 were not rewritten so. One mistake is no longer caught.
- 29 declarations have the word: Formisch, TanStack Query, solid-primitives (15 modules), UI SDK (7), and 5 modules of the
  benchmark's own.
- It can be proven from code, for a listener, a timer, an observer, a promise or an element's event: 984 of the words in
  193 generated drafts (932 of them in three packages' DOM event maps, a count of 2026-11-26, not re-run).

## Cost

- 69 lines in the crate, 28 in `ref/src` (13d9ae1).
- One word, where a function type is written. The same word is not in `.rx`: an `.rx` fn's parameter has none.

## What it does not do

- It does not say *once while the call is made* (a ref callback, an initial value). That closure must be pure, or JavaScript.
- It does not refuse an action where the word is absent. This could be the stricter half, and was not built.

## Alternatives tried and rejected

- *A third word, `tracked`,* for a callback called inside a computation. Withdrawn: an unmarked function is already pure,
  which is what it needs.
- *`handler` off the name (`on…`).* False: `createControllableSignal`'s `onChange` is called from a function that may be
  called anywhere (`bench/coverage/audit.txt`).
- *Accept writes in any closure given to JavaScript.* A library may call it in a memo. Solid throws there.

## Compatibility

A declared component's prop named `on…` with a plain function type is no longer a handler by name. No upstream program has
a declared component.

## Open questions

- Is the action enough? Upstream may keep one way. Then the word's check, on an *action* given where none is safe, is
  what is lost.
- If taken: should an action be refused where the row has no `handler`?

## Prototype

MO-10g. S-module-12, 28. 13d9ae1.
