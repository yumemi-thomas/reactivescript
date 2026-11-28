# 06 — A row for a method of a declared value

Needs [02](02-signature-grammar.md)'s `export const`.

## Problem

A method has no row, so a call that does something is accepted in a view. This shows a toast at each computation:

<!-- check branch=IO_IN_REACTIVE upstream=ok -->
```rx
import { toast } from "./l.js"
export default component App() { <p>{toast.success("a")}</p> }
-- file: ./l.d.rx
export fn toast(a: string): number
```

## Proposal

`export fn toast.success(…)` beside `export fn toast` or `export const toaster`: a fn's row whose name takes one step. A method of an io import that no row calls `pure`
is io. That is R-io-4 as written (*every JS import is `io`*), applied to a method; upstream's checkers stop at the import's name.

<!-- check branch=IO_IN_REACTIVE upstream=PARSE -->
```rx
import { toast } from "./l.js"
export default component App() { <p>{toast.success("a")}</p> }
-- file: ./l.d.rx
export fn toast(a: string): number
export fn toast.success(a: string): number
```

The object's other names are the object. Before this round the first was accepted, and ran the effect while the view computed:

<!-- check branch=IO_IN_REACTIVE upstream=PARSE -->
```rx
import { toast } from "./l.js"
export default component App() {
  t = toast
  <p>{t.success("a")}</p>
}
-- file: ./l.d.rx
export fn toast(a: string): number
export fn toast.success(a: string): number
```

<!-- check branch=IO_IN_REACTIVE upstream=PARSE -->
```rx
import { toast } from "./l.js"
export default component App() {
  { success } = toast
  <p>{success("a")}</p>
}
-- file: ./l.d.rx
export fn toast(a: string): number
export fn toast.success(a: string): number
```

## Evidence

10 rows in 4 programs: Kobalte's toaster (alpha), solid-sonner's `toast`, UI SDK's (beta), `@solidjs/router`'s `query`. Two of the four are stable. Taken off (`words.mjs`): 10 rows in 4 programs; 1 correct program refused; 9 variants of 2 programs missed, of which 3 are refused still by another diagnostic.

## Cost

503 lines in the crate and 89 in `ref/src` (0e65756), for the rule of which name is the import's, and the aliases of this round (7068a05), not measured apart.

## Known gap

An alias exported by another `.rx` module (`export t = toast`), one passed to a fn, and `toast?.success` with a row are not followed. The last is refused, as a method with no row.

## Compatibility

A method of an io import, called in a view, is refused and was accepted. No module of upstream's repository does it. `config.get("a")` on an undeclared import needs `import pure` or a row.

## Prototype

MO-8t (proposed id). S-module-42.
