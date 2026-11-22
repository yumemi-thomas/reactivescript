# S-module-31 — a fn with several signatures: one row each, the same words on all

Rules: MO-8p, MO-8a, MO-8d, R-io-4, TY-4b.

## Modules

```rx
-- module: ./pick.d.rx
// A JS fn with two signatures (TypeScript's overloads): a row for each. The words — `pure`, a parameter's `ref`, a
// callback's `handler`, what the result is — are the same on every row; the types are what differ.
export pure fn pick(from: string[], at: number): string
export pure fn pick(from: number[], at: number, fallback?: number): number
export fn save(id: number): void
export fn save(id: string, note: string): void
```

A declaration may hold several rows of one fn's name (MO-8p): they are its
signatures, as TypeScript's overloads are, and each is held against the
module (TY-6). The checker reads the first row and no type, so a later row
may differ from it in types alone: another word on the row, on a parameter
both rows have or on the result, or any word on a parameter the first row
has not, is a parse error of the declaration. The declaration's `.d.ts`
(TY-4b) writes one overload per row.

## Program

```rx
import { pick, save } from "./pick.js"

export default component App() {
  word: string = pick(["a", "b"], 0)
  count: number = pick([1, 2], 1, 0)
  <button onClick={() => { save(1); save("a", "kept") }}>{word} {count}</button>
}
```

Accepted by the checker and by TypeScript: each call takes the signature
that fits it.

## Rejected variants

```rx
-- types: TS2322
import { pick } from "./pick.js"
export default component App() {
  word: string = pick([1, 2], 0)
  <p>{word}</p>
}
```

The signature that takes numbers answers a number.

```rx
-- reject: IO_IN_REACTIVE
import { save } from "./pick.js"
export default component App() {
  kept = save("a", "kept")
  <p>{kept}</p>
}
```

`save` is io on every row (R-io-4): which signature a call takes changes
nothing the checker reads.
