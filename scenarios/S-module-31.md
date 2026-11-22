# S-module-31 — a fn with several signatures: one row, and the library's own types for the rest

Rules: MO-8b, MO-8a, R-io-4, TY-4b, TY-6.

## Modules

```rx
-- module: ./pick.d.rx
// A JS fn with two signatures (TypeScript's overloads) has one row, as every export has: the words — `pure`, a
// parameter's `ref`, a callback's `handler`, what the result is — are the fn's, and the row's types are one of its
// signatures, or a type that takes them all.
export pure fn pick(from: string[] | number[], at: number, fallback?: number): string | number
export fn save(id: number | string, note?: string): void
```

```rx
-- module: ./twice.d.rx
// a second row of one name is refused
export fn save(id: number): void
export fn save(id: string, note: string): void
```

An export has one row (MO-8b). The checker reads no type, so it could not
tell which signature a call takes, and what it does read — the row's
words — is a fact about the fn, not about a signature. A library's
overloads are in its own `.d.ts`, which is what types an `.rx` call of a
typed package (TY-4b); the row is held to the module by one of them
(TY-6). For a module with no types of its own, where the declaration is
all TypeScript has, a row takes the signatures together, as here. (A
declaration could hold a row a signature, MO-8p: the rows had to say the
same words, and nothing read the difference.)

## Program

```rx
import { pick, save } from "./pick.js"

export default component App() {
  word = pick(["a", "b"], 0)
  count = pick([1, 2], 1, 0)
  <button onClick={() => { save(1); save("a", "kept") }}>{word} {count}</button>
}
```

Accepted by the checker and by TypeScript.

## Rejected variants

```rx
-- types: TS2322
import { pick } from "./pick.js"
export default component App() {
  word = pick([true], 0)
  <p>{word}</p>
}
```

The row's types are checked as any are.

```rx
-- reject: IO_IN_REACTIVE
import { save } from "./pick.js"
export default component App() {
  kept = save("a", "kept")
  <p>{kept}</p>
}
```

`save` is io (R-io-4), whichever signature a call takes.

```rx
-- reject: PARSE
import { save } from "./twice.js"
export default component App() {
  <button onClick={() => { save(1) }}>save</button>
}
```

A second row of one name is a parse error of the declaration, which says
what to write instead.
