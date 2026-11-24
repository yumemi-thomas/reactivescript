# 02 — Optional, generic and rest parameters in a declared signature; a declared value

Needs nothing. Four forms, each apart. Methods are [06](06-method-rows.md).

## Problem

A row takes a fixed list of parameters and no type variables.

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

<!-- check branch=ok upstream=PARSE -->
```rx
import { limit } from "./l.js"
export default component App() { <p>{limit}</p> }
-- file: ./l.d.rx
export const limit: number
```

## Proposal

1. `b?: T` — a trailing argument may be left out.
2. `f<const T extends string>(…)` — TypeScript's text. The checker reads none of it.
3. `...a: T[]`.
4. `export const x: T` — a value, never io.

Generic parameters are on the declaration alone. A call's type arguments (`f<string>(x)`) are not proposed ([20](20-generic-fns.md)).

## Evidence

242 fn and const rows kept by the benchmark's programs (author-selected): 88 have an optional part, 85 a type parameter, 22 a rest parameter, 11 are values. A row may
count twice.

## Cost

44 lines in the crate, 18 in `ref/src` for 1 and 2 (0b1dd95, 519fddb).

## Compatibility

One row an export: a second row of a name was accepted, and is refused.

<!-- check branch=PARSE upstream=ok -->
```rx
import { f } from "./l.js"
export default component App() { <p>{f(1)}</p> }
-- file: ./l.d.rx
export pure fn f(a: number): number
export fn f(a: string): number
```

The first step need not include that.

## Prototype

MO-8d, e, g, h (proposed ids). S-module-8, 17, 29.
