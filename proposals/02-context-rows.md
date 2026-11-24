# 02 — Rows for a library's contexts

## Problem

A library's hook called with no provider above it throws when it runs. `.rx` refuses this for its own contexts (RG-7b),
and cannot say it of a library's.

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

Accepted by both, and it is what upstream can write. With the words of this proposal the mistake is refused:

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

## Proposal

- `export context c` in a JS module's `.d.rx` names a context the JavaScript owns. `.rx` cannot `use` or `provide` it. It
  is named by the same file's rows.
- `uses(c)` on a fn: each call is a `use` of `c` where it is written, checked by RG-7b. The fn instantiates. On a
  component: what it needs above it.
- `provides(c)` on a component: it provides `c` to everything it renders, its children and each prop. On a fn that hands
  back a `Component`: the made component does.
- `export context c from "<module>"`: the context that another module's declaration declares. This is for a module of the
  app's own that wraps a library's hook:

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

The key of a context is the file that declares it, as RG-7a and MO-7 have it. Nothing is added at run time.

Refused: a name the file does not declare (`NOT_EXPORTED`); `provides` on a fn that makes no component (parse error); a
call outside its provider (`CONTEXT_NOT_FOUND`).

## Evidence

`node proposals/words.mjs` takes a word off every declaration the benchmark keeps, and checks the 160 programs and their
one-line mistakes again (37 tasks, 123 coverage entries, the crate's checker):

| word | rows | programs | correct programs refused without it | mistakes no longer caught |
| --- | --- | --- | --- | --- |
| `uses(c)` | 41 | 21 | 4 | 25 |
| `provides(c)` | 22 | 21 | 21 | 22 |
| `export context c from` | 8 | 8 | 8 | 14 |

- The 4 refused without `uses` are `IO_IN_REACTIVE`: the word also makes the fn instantiate.
- `provides` alone taken off refuses programs because `uses` stays: the pair is one decision. `uses` is the word that finds
  mistakes.
- `uses`: TanStack Query and Router, `@solidjs/router`, Kobalte, UI SDK, Wardic. Six libraries, by different authors.
- `from`: four libraries, in eight programs.
- Both words can be proven from code, sometimes: 25 `uses` and 43 `provides` of the 1,659 words written into generated
  declarations ([10](10-generated-declarations.md)). Most rows in the tasks are a person's: the routers' hooks read their
  context on one path only, which the reading does not prove.

## Cost

- 112 lines in the crate's checker and parser, 39 in `ref/src` for `uses` and `provides` (452438c, 8e06515), once
  [01](01-component-rows.md) is in. `from` came with another form: 209 and 84 lines together (0c674ca).
- To learn: three words, two of them `.rx`'s own with the same meaning.
- The static application tree already carries RG-7b.

## What it does not do

- No type on a JS context. Its value is not `.rx`'s.
- A wrong row is believed: `provides(c)` on a component that puts its children beside the provider accepts a program that
  throws. `rx-verify` runs it ([11](11-rx-verify.md)).
- A context read on some path only is not said. `uses(c)` is then a person's choice: it refuses a call that might not need
  it.

## Alternatives tried and rejected

- *Infer `uses` from a name (`use…`).* Wrong for a hook with a default; refused correct programs. Withdrawn.
- *Read `uses` off a run that fails with no provider.* A run that fails says something is missing, not what. Withdrawn
  (`spec/archive/generated-words-2026-11-24.md`).
- *One word for both sides (`context(c)`).* A provider that needs another above it (`uses(router)` and `provides(query)`)
  needs both.
- *Copying a library row's words to the app's wrapper by reading its text.* Built, then withdrawn: where the words were a
  person's, the tool repeated them as its own.

## Compatibility

No program accepted upstream changes. `context` at the head of a `.d.rx` row was a parse error.

## Open questions

- Should a project be able to add `uses(c)` to a row of a package's own declaration without copying the file?
- A printed signature of an `.rx` package says `uses(./theme.rx#theme)`, a path to a declaring file. Two spellings for
  one idea: is that acceptable?

## Prototype

MO-12a to MO-12e. S-module-7, 35. 452438c, 8e06515, 0c674ca.
