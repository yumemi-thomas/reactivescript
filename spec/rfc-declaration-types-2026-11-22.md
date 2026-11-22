# Declaration types: what a `.d.rx` says of a library's types, and where it comes from (2026-11-22)

A design note for 09 MO-8d (revised), MO-8m and MO-8n. The benchmark's
declarations held 193 `any`s (`bench/scorecard.txt` at `1de2e6e`), nearly
all drafted by `rx-declare`. This is why, what was done about each cause,
and what a declaration should carry.

## Why a draft said `any`

Each `any` of the benchmark's `.d.rx` files, by the cause the draft's own
type gives (`rx-declare --explain`; one cause per `any`, the first that
applies in the order below):

| cause | at `1de2e6e` | now | what it took |
| --- | --- | --- | --- |
| it ranges over a type parameter (`generic`) | 78 | 5 | the row's type parameters, as the library declares them (MO-8d) |
| the same, through a conditional, mapped or indexed type (`generic-computed`) | 19 | 5 | the type written as the library computes it |
| a callback's type, never written (`callback`, a render prop's parameters, a rest parameter, a function inside a type) | 47 | 4 | the callback's own signature |
| a type another package declares (`other-package`) | 15 | 0 | `import("<package>").T` |
| a type the module exports, generic or bounded (`own-type`) | 9 | 0 | the draft's alias for it, with its bounds |
| a type no module exports (`internal-type`) | 5 | 3 | its place in the library's declaration |
| a fn with several signatures (`overload`) | 6 | 2 | — |
| a row a person wrote or edited (the benchmark's own, and one of `known.js`) | 14 | 5 | by hand |
| | **193** | **24** | |

No cause needed a type the notation could not hold: a row's types are
TypeScript's text (MO-8d), both parsers take any of it (an import type, a
`typeof`, a conditional, a mapped type), and the checker reads none of it.
The draft said `any` because it restated types and gave up where the
restatement named something it had no name for. MO-8m is the other way
round: the draft *names* the library's type where the library declares it,
and has TypeScript hold each row against the module before it is written.

Of the 24 left: 15 are one row, Kobalte's `Select` root, whose props are a
union of two records (single and multiple selection) that no one record
of props is; 2 are an overloaded fn's parameters; 2 are a function result
of a generic fn; 5 are in rows written by hand (the table adapter's result,
which states what the app reads of a table, and `useParams`'s `ref any`).

## One grammar change: a component's type parameters

A fn's row could carry type parameters (MO-8d); a component's could not —
`export component Select<Option>(…)` was a parse error — so a generic
component's props could only be `any`. That is the one thing the notation
lacked. It is added in both checkers, with the declaration's `.d.ts` and
TY-6's boundary check carrying the parameters as written, and in the
tree-sitter grammar (S-module-29, the unit
`a_component_row_may_have_type_parameters` in both). The checker reads
nothing new: the parameters are text.

## Should a `.d.rx` restate a library's types?

No — and for a package with types of its own it already does not have to.
Three facts of the rules as they stand:

1. `.rx` code that imports a typed package is type-checked against the
   package's own `.d.ts` (TY-4b, MO-8k). The declaration's types are used
   in its place only when the package has none.
2. TY-6 lets a declaration say *less* than the types, never something
   else. A restated type can at best equal the vendor's and is otherwise
   looser or a `DECLARATION_MISMATCH`.
3. The checker reads a row's shape and words: `ref`, a function type and
   `handler`/`tracked`/`draft` on it, `() => void`, `Promise<…>`, `View`,
   `Component`, a record's or a tuple's parts, `pending`, `fails`. It
   treats `any`, `Opts` and `import("kit").Opts` alike.

So for a typed package the type text of a row is a restatement nothing
consumes: it costs words, goes stale, and can only be wrong. What a
declaration is *for* is what no `.d.ts` says — the behavioural words, and
the shape they attach to. The recommendation:

- **A row carries shape and words; its leaf types are the vendor's, by
  reference.** This is what MO-8m drafts. It is honest about what it is:
  of the `any`s that went, the ones replaced by a callback's signature,
  a row's type parameters or a record's fields tell the checker something
  (a function, what it answers, a field); the ones replaced by a name
  (`import("kit").Opts`, 75 in the benchmark's files) tell a reader
  something; the ones replaced by a place (`Parameters<typeof
  import("kit").f>[0]`, 75) tell nobody anything `any` did not — they
  hold by construction. They are the measure of how much of a row is
  pure restatement.
- **Proposed, not done: a row may leave a type out and mean the
  vendor's.** Today a parameter with no type is `any` to TY-6 and to a
  projection. For a module with types of its own, an omitted type could
  be read as "the module's, at this position" — `export fn insert(form,
  config): void`, `export component Dialog.Trigger(props: { onClick?;
  ref?; as? }) uses(dialog)` — which is what the by-place references
  spell at length. It needs: TY-6's check to write the module's own type
  for an omitted position (it already has `__real`), the projection for a
  typeless package to keep `any`, and the same reading in `ref/`. It was
  not done here because it changes what an existing row means (an
  untyped parameter is `any` today), which is a ruling, not a draft's
  choice. With it, by-place references go, and the `any` count measures
  only positions where a shape is unknown.
- **Proposed, not done: a fn with several signatures.** A row is one
  signature (MO-8a), and the draft takes the shortest. The vendor's
  overloads still type the `.rx` call (fact 1), so the cost is only the
  row's own text: a parameter with no one place stays `any`. Either
  several rows of one name with the same words (`export fn on(a): void`
  twice — a grammar change, and the words must agree), or the omitted
  type above, which needs no place. The second is smaller.
- **Not a change: a union of records as props.** Kobalte's `Select` root
  is `(single | multiple) & …`. The row is one record, as the checker
  reads props; TypeScript checks the application against the vendor's
  union (fact 1). Under the omitted-type reading its 15 `any`s are
  positions with no type written, and nothing is lost.

## From the library's source

`rx-declare --source [<checkout>]` (MO-8n) was tried on the benchmark's
libraries. What each publishes (the versions `bench/package.json` pins):

| package | publishes | source used |
| --- | --- | --- |
| `@tanstack/solid-query` 6.0.0-rc.6, `@tanstack/query-core` | `src/`, `.d.ts.map` and `.js.map` (with `sourcesContent`) | published `src/` |
| `@tanstack/solid-router` 2.0.0-rc.11, `router-core`, `solid-start` | `src/`, `.js.map` with `sourcesContent` | published `src/` |
| `@tanstack/table-core` 8.21.3, `@tanstack/virtual-core` 3.19.11 | `src/`, `.js.map` with `sourcesContent` | published `src/` (no Solid in them) |
| `@solid-primitives/event-listener` 3.0.0, `resize-observer` 4.0.0 | `dist/` only | checkout at the release's tag |
| `@kobalte/core` 2.0.0-alpha.4 | `dist/` only | checkout at the release's tag |
| `@formisch/solid` 1.3.0, `valibot` 1.5.0 | `dist/` only (bundled declarations) | checkout at the release's tag |
| `@solidjs/router` 2.0.1 | `dist/` only | checkout at the release's tag |
| `solid-js` 2.0.2, `@solidjs/signals` | `dist/` and types only | — |

Half ship their source; the other half need a checkout, and every one of
them names its repository and has a tag for the release, so "check out
`<repository>` at `<version>`" is what the tool says.

**Types.** Reading the types from the source instead of the published
declarations gains nothing: for `@tanstack/solid-query` all 173 rows are
the same text, and for `@solid-primitives/event-listener` 6 of 18 rows
are worse (the source imports what only its own workspace resolves, so
those types are `any` in the app's project). The published `.d.ts` *is*
the type checker's reading of the source, taken in the project that can
build it. The types stay the declaration's.

**Words.** The source is where the words are, and a syntactic reading
finds them:

- `@solid-primitives/event-listener`, `resize-observer`: the listener
  goes to `addEventListener`, the callback to `new ResizeObserver`
  (`handler`), `createEventListener` reaches `createEffect`
  (`instantiates`) — every word the benchmark's declaration writes by
  hand, each with its line.
- `@kobalte/core/dialog`: each part reads `DialogContext` (`uses`), as
  running the package found (`--run --dom`). The root's `provides` is not
  found: the root is assembled with `Object.assign`.
- `@solidjs/router`: `createRouter` renders the router context's provider
  and its hooks read it (`provides`, `uses`), as `known.js` says.
- `@tanstack/solid-query`: every hook reads `QueryClientContext`; its
  `queryFn` is handed to `@tanstack/query-core` and followed no further,
  so `tracked` (which `known.js` states) is not found. One package's
  source is where the reading stops.
- `@tanstack/solid-router`: `select` options are called inside
  `createMemo` (`tracked`); its context is made through a helper the
  reading does not see through, so no `uses`.
- `@formisch/solid`: `Field`'s `children` is called while it renders (no
  word), `onSubmit` goes to another package.

The evidence is written above the row as a comment with its file and
line and never becomes the row: the reading follows names, not values or
types, a checkout may be another version, and a word is the
declaration's assertion (MO-8b). What would make it more than a
suggestion is the run: `rx-verify` already checks `handler`, `tracked`,
`uses` and `provides` by running the package, so a suggestion is a claim
to hand it — proposed, with reading a second package's source where a
callback is handed on, and checking `known.js`'s rows against the
source of the release they name.

## The numbers

`node bench/run.mjs` before (`1de2e6e`) and after:

| | good | types | runtime | bad caught | unrepresentable | hand-written words | `any` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before | 72/72 | 107/107 | 120/121 | 104/106 | 8/8 | 216 | 193 |
| after | 72/72 | 107/107 | 120/121 | 104/106 | 8/8 | 144 | 24 |

The three red checks are the ones each task's `known` gives a reason for,
unchanged. The hand-written words fell because a draft that names types
is closer to what a person keeps: a row copied from it differs by its
words alone.
