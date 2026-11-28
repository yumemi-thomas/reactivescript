# 12 — A library's contexts

Needs [01](01-foreign-tags.md).

## Problem

A library's hook called with no provider above it throws. `.rx` refuses that for its own contexts (RG-7b), and cannot say it of a library's.

<!-- check branch=ok upstream=ok -->
```rx
import { useQuery } from "./q.js"
export default component App() {
  q = useQuery("a")
  <p>{q}</p>
}
-- file: ./q.d.rx
export pure fn useQuery(key: string): ref string
```

## Proposal: the smallest step

- `export context c` in a JavaScript module's `.d.rx` names a context the JavaScript owns. `.rx` cannot `use` or `provide` it.
- `uses(c)` on a fn: each call is a `use` of `c` where it is written (RG-7b). The fn instantiates.
- `provides(c)` on a component: it provides `c` **to its children**.

<!-- check branch=CONTEXT_NOT_FOUND upstream=PARSE says-branch="use client (in useQuery())" says-upstream="near 'context client'" -->
```rx
import { QueryProvider, useQuery } from "./q.js"
export default component App() {
  q = useQuery("a")
  <QueryProvider><p>{q}</p></QueryProvider>
}
-- file: ./q.d.rx
export context client
export component QueryProvider(props: { children?: View }) provides(client)
export pure fn useQuery(key: string): ref string uses(client)
```

**RG-7b** gives a provision to *every region instantiated beneath it*. A declaration must therefore name where that is. Children placed in the tag are one place; a prop is
another: a library may read it before its provider exists. The prototype credits `provides(c)` to children **and** every prop typed `View`. That is more than this step claims, and a wrong row is believed there.

## `uses` is every call

A hook that needs its provider on some calls only has no word. With `uses(c)` the row is wrong, and a correct call is refused. It is the row's fault, and the row must leave the word out:

<!-- check branch=CONTEXT_NOT_FOUND upstream=PARSE -->
```rx
import { useQ } from "./kit.js"
export default component App() { q = useQ(false)
  <p>{q}</p> }
-- file: ./kit.js
export function useQ(needs) { if (!needs) return "offline"; throw new Error("provider needed"); }
-- file: ./kit.d.rx
export context q
export pure fn useQ(needs: boolean): string uses(q)
```

<!-- check branch=ok upstream=ok -->
```rx
import { useQ } from "./kit.js"
export default component App() { q = useQ(false)
  <p>{q}</p> }
-- file: ./kit.d.rx
export pure fn useQ(needs: boolean): string
```

Later, apart: `export context c from "<module>"`, for a module of the app's own that wraps a library's hook:

<!-- check branch=CONTEXT_NOT_FOUND upstream=PARSE -->
```rx
import { useTodos } from "./todos.js"
import { Provider } from "./q.js"
export default component App() {
  t = useTodos()
  <Provider><p>{t}</p></Provider>
}
-- file: ./q.d.rx
export context client
export component Provider(props: { children?: View }) provides(client)
-- file: ./todos.d.rx
export context client from "./q.js"
export pure fn useTodos(): ref string uses(client)
```

## Evidence

`node proposals/words.mjs` takes a word off each declaration the benchmark keeps and checks its programs and their one-line mistakes again (author-selected; a missed *variant* is one whose expected diagnostic
is no longer given: it is accepted, or refused by another one).

- `uses(c)`. Taken off (`words.mjs`): 41 rows in 21 programs; 4 correct programs refused; 25 variants of 14 programs missed, of which 10 are refused still by another diagnostic.
- `provides(c)`. Taken off (`words.mjs`): 22 rows in 21 programs; 21 correct programs refused; 22 variants of 9 programs missed, of which 4 are refused still by another diagnostic.
- `context … from`. Taken off (`words.mjs`): 8 rows in 8 programs; 8 correct programs refused; 14 variants of 5 programs missed, of which 3 are refused still by another diagnostic.

`provides` alone taken off refuses programs because `uses` stays: the pair is one decision. The libraries: `@solidjs/router` and Wardic (stable), UI SDK (beta), Kobalte (alpha), TanStack Query and Router (release
candidates). Two stable ones.

## Cost

112 lines in the crate, 39 in `ref/src` (452438c, 8e06515), after 01. `from` came with another form: 209 and 84 (0c674ca).

## Rejected

Reading `uses` off a name (`use…`), or off a run that fails with no provider: both gave false words.

## Compatibility

`context` at the head of a `.d.rx` row was a parse error.

## Prototype

MO-12a to e (proposed ids). S-module-7, 35.
