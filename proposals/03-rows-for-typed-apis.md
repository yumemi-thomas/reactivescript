# 03 — Rows that can write a typed API

## Problem

A row takes a fixed list of parameters with no type variables. Most library functions do not fit.

<!-- check branch=ok upstream=PARSE -->
```rx
import { f } from "./l.js"
export default component App() { <p>{f(1)}</p> }
-- file: ./l.d.rx
export pure fn f(a: number, b?: number): number
```

<!-- check branch=ok upstream=PARSE -->
```rx
import { f } from "./l.js"
export default component App() { <p>{f(1)}</p> }
-- file: ./l.d.rx
export pure fn f<T>(a: T): T
```

<!-- check branch=ok upstream=PARSE -->
```rx
import { f } from "./l.js"
export default component App() { <p>{f(1)}</p> }
-- file: ./l.d.rx
export pure fn f(...a: number[]): number
```

A value that is no function has no row, and a method has none, so a call that does something is accepted in a view:

<!-- check branch=ok upstream=PARSE -->
```rx
import { limit } from "./l.js"
export default component App() { <p>{limit}</p> }
-- file: ./l.d.rx
export const limit: number
```

<!-- check branch=IO_IN_REACTIVE upstream=ok -->
```rx
import { toast } from "./l.js"
export default component App() { <p>{toast.success("a")}</p> }
-- file: ./l.d.rx
export fn toast(a: string): number
```

Each `PARSE` is at the first character upstream does not read. The last program shows a toast at each computation.

## Proposal

Six forms. Each can be taken alone.

1. **Optional parameters**, `b?: number`: a trailing argument may be left out.
2. **Type parameters** on a fn, a type and a component, `f<const T extends string>(…)`. TypeScript's text. The checker
   reads none of it; it reads the shape around types (`ref`, a function type, a record's fields).
3. **Rest parameters**, `...a: number[]`.
4. **Values**, `export const x: T`: imported, never io.
5. **A method's row**, `export fn toast.success(…)` beside `export fn toast` or `export const toaster`: a fn's row whose
   name takes one step, with every word a fn has. With no row, a method of an io import is io; a method of a declared
   value is read by its declared type (nothing or a promise: io).

<!-- check branch=IO_IN_REACTIVE upstream=PARSE -->
```rx
import { toast } from "./l.js"
export default component App() { <p>{toast.success("a")}</p> }
-- file: ./l.d.rx
export fn toast(a: string): number
export fn toast.success(a: string): number
```

6. **Props as the library's own type**, `component Toggle(props: ToggleOptions & { onPress?: handler () => void })`. The
   type is TypeScript's. The record after `&` holds the fields the checker reads. Each must name a prop the type has, with
   a type it takes.

**One row an export.** A second row of one name is a parse error. Overloads are TypeScript's to check from the library.

<!-- check branch=PARSE upstream=ok -->
```rx
import { f } from "./l.js"
export default component App() { <p>{f(1)}</p> }
-- file: ./l.d.rx
export pure fn f(a: number): number
export fn f(a: string): number
```

## Evidence

Of 242 fn and const rows the benchmark keeps, 88 have an optional part, 85 type parameters, 22 a rest parameter (or a
spread), 11 are values (`grep`, counted at a349e48; a row may count twice). 100 component rows name a type for their props.

- **Method rows**: 10 in 4 programs (Kobalte's toaster, solid-sonner's and UI SDK's `toast`, `@solidjs/router`'s `query`).
  Taken off (`node proposals/words.mjs method`): 1 program refused, 9 mistakes accepted.
- **Props' types**: a draft of `@ui-sdk/solid` with every attribute written out was 4.46 MB; with the type named, 0.23 MB
  (record of c3c9b88, not re-run).

## Cost

- 1, 2: 44 lines in the crate, 18 in `ref/src` (0b1dd95, 519fddb). 5: 503 and 89 (0e65756), the dearest, for the rule of
  which name is the import's. 6: 231 and 59, beside 1,306 in the drafting tool (95764d8, 594ca6b, 9783204).
- The projection carries type parameters as text.
- To learn: nothing but TypeScript's forms, save 5.

## What it does not do

- The checkers do not check types. A wrong one is TypeScript's to find ([04](04-where-a-declaration-is-found.md)).
- `toast?.success(…)` and a method two steps deep have no row.
- `.rx` fns themselves have none of these: [14](14-optional-parameters.md), [16](16-generic-fns.md).

## Alternatives tried and rejected

- *A row for each overload.* Built, then withdrawn (MO-8p): the words had to agree anyway.
- *A field's words in an opaque result* (`{ show: io }`). A method's row says it with the words a fn has.
- *A form for a module's default export.* Not needed: a row named `default` is accepted upstream by both checkers.

<!-- check branch=ok upstream=ok -->
```rx
import { default as online } from "./l.js"
export default component App() {
  up = online()
  <p>{up ? "y" : "n"}</p>
}
-- file: ./l.d.rx
export pure fn default(): ref boolean
```

## Compatibility

Two rows of one name are refused, and were accepted (the program above). A method of an io import called in a view is
refused, and was accepted. In upstream's 305 modules neither occurs.

## Open questions

- Is the rule for a method with no row (io if it answers nothing or a promise) too clever? It is needed for
  `{toast.success("a")}` with a draft.
- Should form 6 allow two records, or a type alone with no `&`?

## Prototype

MO-8d, e, g, h, o, t, u, MO-8b. S-module-8, 17, 29 to 32, 42, 43. Commits above, and df7b0f9, e770bad.
