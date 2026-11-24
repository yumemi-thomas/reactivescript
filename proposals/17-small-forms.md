# 17 — Two small forms of surface

Each can be taken alone. Neither depends on another proposal.

## `for (const x of e) { … }` in imperative scope

**Problem.** A run over a list that waits for each step cannot be written. `forEach` with a closure is a list of other runs: an
`await` in it is not the action's.

<!-- check branch=ok upstream=PARSE says-upstream="expected ')' near 'x of xs" -->
```rx
import { send } from "./api.js"
export default component App() {
  source total := 0
  action add(xs: number[]) {
    try { for (const x of xs) { await send(x) } } catch (e) { log("failed") }
    total := len(xs)
  }
  <button onClick={() => { add([1, 2]) }}>{total}</button>
}
```

**Proposal.** JavaScript's statement, in an action, a handler, or an apply block. Its body is the run it is written in: it may await
and return. The loop visits what the list held when it started. The variable is a value.

**Evidence.** A draft's rows are visited so (`d.items`, [08](08-draft.md)). No count of programs was made.

**Cost.** 54 lines in the crate's parser and checker, 41 in its emitter, 32 and 7 in `ref` (d45dc35). One difference from
JavaScript to learn: a list that grows is not followed.

**Not done.** `break`, `continue`, `for await`, `while`.

**Rejected.** *`Promise.all` through a JS helper*: it is not in order.

## A type on a closure's parameter

**Problem.**

<!-- check branch=ok upstream=PARSE says-upstream="expected ')' near ': number) => x + 1" -->
```rx
export default component App() {
  inc = (x: number) => x + 1
  <p>{inc(1)}</p>
}
```

Under `strict`, TypeScript says of an untyped one that it is `any`:

<!-- types branch=TS7006 upstream=TS7006 -->
```rx
export default component App() {
  inc = (x) => x + 1
  <p>{inc(1)}</p>
}
```

**Proposal.** `(x: T, y: U) => …`, TypeScript's text (07 §2), as on a fn. A result type as well is not proposed.

**Evidence.** `handler` closures given to a library (`(e: KeyboardEvent) => …`), in the benchmark's tasks.

**Cost.** 9a8a7c9; small in both parsers. `(a: b) => c` after `?` in a conditional is read as TypeScript reads it.

**Compatibility.** Both forms are parse errors upstream.

**Prototype.** 07 §3, §5. S-surface-6, 10. 9a8a7c9, d45dc35.
