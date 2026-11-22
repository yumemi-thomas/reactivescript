# Declaration types: what a `.d.rx` says of a library's types, and where it comes from (2026-11-22)

A design note for 09 MO-8d (revised), MO-8m, MO-8n, and (second round, the
same day) MO-8o, MO-8p and MO-8q. The benchmark's
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

(That table is the first round's, at `95764d8`; "The numbers" below has
the second's, where none of the 24 is left.) Of the 24 left then: 15 are one row, Kobalte's `Select` root, whose props are a
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
- **Dropped: a row may leave a type out and mean the vendor's.** The
  first draft of this note proposed reading an omitted type as "the
  module's, at this position". It is withdrawn, for three reasons. It
  changes what an existing row means (an untyped parameter is `any` to
  TY-6 and to a projection today), which no draft should do. It hides
  the type from the one reader who has only the declaration: a row would
  hold nothing a person can read, where the library has a perfectly good
  name. And it was a remedy for by-place references, whose cause turned
  out to be the draft, not the notation: the draft rendered TypeScript's
  *resolved* type and knew the names of one module's exports, so
  anything a library computes or exports from a subpath had no name. Fix
  the draft (MO-8o) and the references go without a new reading.
- **Done: types from the declaration, names from every module (MO-8o).**
  The draft writes a row's types from the annotation the library's own
  `.d.ts` gives each position, and looks each name up in every module the
  app can import: every subpath of the package's `exports`, the packages
  it depends on, under the name it has there (a bundle's `X$1` through
  its symbol). `insert<TSchema extends FormSchema, TFieldArrayPath
  extends RequiredPath>(form: import("@formisch/solid/v2/internals")
  .BaseFormStore<TSchema>, config: InsertConfig<TSchema,
  TFieldArrayPath>): void` was `insert(form: Parameters<typeof import(…)
  .insert>[0], config: Parameters<…>[1])`.
- **Done: props as the library's type, and a record of the fields that
  carry words (MO-8o).** `props: P & { … }`. The syntax is TypeScript's
  intersection, chosen over a new word (`with`) because both parsers,
  both projections and the tree-sitter grammar read it with no new
  construct, and because TypeScript's reading of it is the right one: the
  record narrows the props, it never widens them, which is TY-6b. Two
  things were learned making it hold. A plain prop in a record was
  already nothing to the checker (it reads a function type, `Component`,
  a render prop, `catches`, `renders`; an undeclared prop and a declared
  plain one are the same row), so leaving them to the type loses nothing.
  And beside type parameters the record must not take part in inference:
  with `onChange?: (value: Option) => void` written again, TypeScript
  found `Option` from the record and refused the row; the boundary check
  wraps the record in `NoInfer`. Kobalte's `Select` root — a union of two
  records, 15 `any`s — is one line with none.
- **Done: a fn with several signatures (MO-8p).** One row each. The
  doubt was soundness: the checker reads no type, so it cannot pick a
  signature, and words that differed by signature would have no reading.
  The rule makes that unsayable rather than unsound: the checker reads
  the first row, and a later row that says another word is a parse
  error. Where a library's overloads do differ in what the checker reads
  (one takes an accessor, another a value), the draft keeps one row, as
  before, and says so; none of the benchmark's libraries has such a fn
  among the rows its apps use.
- **Ruled: `any` is the library's, or it is not written (MO-8q).** With
  the three above, an `any` in a declaration is either the library's own
  (kept as it is) or a defect. They are counted apart, the second must be
  none, and a by-place reference is counted on its own so that it is not
  where the `any`s go.

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

`node bench/run.mjs`, at `1de2e6e` (before MO-8m), at `95764d8` (MO-8m)
and now (MO-8o, MO-8p, MO-8q). The `any`s of the first two columns are
split by the rule of the third (counted over the same files with the
draft of each export as the measure of what is the library's):

| | good | types | runtime | bad caught | unrepresentable | hand-written words | `any` inherited | `any` introduced | by-place |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `1de2e6e` | 72/72 | 107/107 | 120/121 | 104/106 | 8/8 | 216 | — | 193 (all `any`s) | — |
| `95764d8` | 72/72 | 107/107 | 120/121 | 104/106 | 8/8 | 144 | 0 | 24 | 81 |
| now | 72/72 | 107/107 | 120/121 | 104/106 | 8/8 | 135 | 23 | 0 | 4 |

The three red checks are the ones each task's `known` gives a reason for,
unchanged. `bench/any-allowlist.json` is empty.

**Inherited (23).** Each is an `any` the library wrote: 22 in valibot's
own bounds (`BaseValidation<any, unknown, BaseIssue<unknown>>`, in the
`InferOutput`, `InferIssue` and `SchemaWithPipe` aliases the rows now name,
two tasks), 1 a default of Kobalte's (`Select.Listbox<Option = any, …>`).
They appeared when the rows began to name the library's types: before,
those types were not written at all.

**By place (4).** Kobalte's `Select.Listbox` render prop is given an
accessor of a collection whose types (`Collection`, `CollectionNode`) no
subpath exports (2); the table adapter's `flexRender` takes `((props: P)
=> JSX.Element) | JSX.Element`, which written out would be read by the
checker as a callback (1: the place is what keeps it a value); TanStack
Router's `Link`, a row of `known.js`, keeps its `params` by place (1).

**In a whole draft.** The benchmark's files keep the rows their apps use.
Drafting every export of the same modules (26 drafts, valibot and
TanStack Query each for two tasks): 361 `any`s and 1347 by-place parts at
`95764d8`; 287 and 260 now, of which 175 `any`s are the libraries' own
and 110 the draft's. Those are in valibot (36 a draft: a fn with more
than twelve signatures keeps one row, and a predicate or a rest parameter
over a type parameter has no text yet), TanStack Router (30: types its
`.d.ts` cannot resolve from the app's project, callbacks generic in
themselves), `@tanstack/solid-query` (3) and `@solidjs/router` (2). Each
is written with a `// TODO <export>: … the draft's, not the library's
(<cause>)` line above its row, and `--explain` counts them. They are the
next thing to remove; no benchmark app reaches one.
