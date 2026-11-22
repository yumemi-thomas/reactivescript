# Declaration types: what a `.d.rx` says of a library's types, and where it comes from (2026-11-22)

A design note for 09 MO-8d (revised), MO-8m, MO-8n, (second round, the
same day) MO-8o, MO-8p and MO-8q, and (third round, at the end) MO-8q over
whole drafts and 13 TY-6f. The benchmark's
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

## Third round: the whole draft, and the record held

**The record after a props' type is held to it (13 TY-6f).** `props: P &
{ … }` was held as `P & NoInfer<{ … }>`, and an intersection can only
narrow: the library's component takes `P & R` whatever `R` says, so a
field written with the wrong type (`onChange?: handler (v: number) =>
void`) or under a name the library has not (`onChanged`) passed. Each
field is now held on its own: it names a prop of `P`, and its type is
assignable to `P`'s type for that prop. The direction — the record's type
fits the library's, not the other way — is TY-6b's (a declaration says
less, never something else) and is the sound one for a callback: the
callback as the record types it must take everything the library calls it
with. The row's type parameters are types of their own in these checks
(default, else bound, else a type nothing else is): TypeScript reads no
prop of `PolymorphicProps<T, …>` while `T` is a parameter. No word was
added and no parser changed; the check is two lines a field in the crate's
boundary file, each with what it asks, and `rx-tsc` says it with the prop
and both types. Kobalte's `Select` row holds as drafted; changing its
`onChange` to `(value: number) => void`, or its name to `onChanged`, is
refused.

**No `any` in a whole draft is the draft's (MO-8q, extended).** Drafting
every export of the modules the benchmark declares (25 drafts; the
workspace's install) gave 290 `any`s — 175 the libraries' own and 115 the
draft's — and 252 parts by place. The 115, by what caused each and what
removed it:

| cause | `any`s | where | what it took |
| --- | --- | --- | --- |
| a type parameter's bound, a helper alias written out, was longer than a row was let be (640 characters): the row lost its type parameters, and everything over them was `any` | 24 | valibot: `argsAsync`, `entriesFromObjects`, `getDefaults(Async)`, `getFallbacks(Async)`, `omit`, `pick`, `unwrap` (two drafts) | a row is not cut to a length |
| the library's own `any`, reproduced inside a named type, was counted as the draft's: the reading that named the type lost to one that dropped it | 5 | valibot `getExamples`, `getMetadata` (two drafts); TanStack Router `useRouterState` | the readings are ranked by the `any`s the draft adds (the marker of a library `any` contained the word) |
| beside type parameters, a part with no name was said by its place *at the bounds*, which is another type: the row did not hold, and fell back | 13 | valibot `forwardAsync`, `keyof` (two drafts); `useBlocker`, `linkOptions`; solid-query `useQueries` | the place at the row's type parameters, `typeof import("kit").f<T, U>`; a position that is a parameter the row does not declare is its bound's place |
| a predicate had no text (`(input) => input is T`, which `=> boolean` is not) | 2 | valibot `guard` (two drafts) | written as the library writes it; a parameter that is a type parameter is that parameter |
| a record of an options parameter left out a field the library requires and a row cannot write (`"~run"`): TypeScript held no reading, and the row every draft had did not parse | 16 | valibot `forward` (two drafts) | such options are the type the library declares |
| a function field of a result had `any` parameters where its place was known | 4 | `@solidjs/router` `createBeforeLeave`; TanStack Router `composeRewrites` | the place before an `any` |
| a bound with no name at all (a recursive helper type): no type parameters, and of two signatures no place | 20 | valibot `partialCheck`, `partialCheckAsync` (two drafts) | the last reading: the last signature, every part by its place as it stands |
| an accessor parameter of a type no module exports had no place | 4 | solid-query `useMutationState`, `useQueries` (two drafts) | what the parameter answers, `ReturnType<Parameters<…>[0]>` |
| a result the app's project cannot resolve (`import("solid-js/web").JSX.Element`, from a package built against another Solid): not seen as a component, its result `any` | 5 | TanStack Router `Await`, `Match`, `ScriptOnce`, `HeadContent`, `Scripts` | `JSX.Element` is an element by the name the library wrote |
| options with a predicate field and fields generic in themselves, written a field at a time | 12 | TanStack Router `createSerializationAdapter` | the options by the name the library declares |
| a prop that is a function of nothing giving an element was `Component`, which takes props: TypeScript held no reading | 5 | TanStack Router `CatchBoundary` | a render prop, `() => View` |
| a component with several signatures has no one place | 5 | TanStack Router `Block` | its last signature, by its place |
| | **115** | | |

(The note above counted 110 and 260. Measured again at the same commit in
the benchmark's workspace, with the count `bench` now makes, the numbers
are 115 and 252; why the two counts differ was not traced. The second is
the one `bench --check` holds.)

Now: **0** of the draft's, 306 the libraries' own, 136 by place. The
libraries' own rose from 175 because rows that were `any` altogether now
name the library's types, `any`s and all (`BaseValidation<any, unknown,
BaseIssue<unknown>>` in a bound). `bench/any-allowlist.json` stays empty.

**By place (136).** What is left, by kind:

- the library's own text (`options: ReturnType<DefinedInitialDataOptions<…>>`,
  `params: Parameters<T>`): not a place at all, counted because the count
  is of the two words;
- a callback by the name of the function type the library declares for it
  (`(...args: Parameters<Navigator>) => ReturnType<Navigator>`): the name
  is there, taken apart so that the checker reads a function type;
- a part of a type no module exports — Kobalte's collection types,
  valibot's `ValidPath`, TanStack Query's `MutationStateOptions`, a
  router's internal blocker and rewrite types — at the row's type
  parameters where it has them;
- the last reading's rows (`keyof` is not one: its two signatures are told
  apart by how many type arguments they take; `partialCheck`,
  `useQueries` and a few of the routers' are).

The first two could be counted apart (a count of `typeof import(` would
leave them out); the number is kept as it was so that it compares with the
scorecards before it.

**What stayed a proposal.**

- *A name for a library's unexported helper types.* The last reading and
  most by-place parts exist because a type the library declares is not
  exported (`DeepPickN`, `ValidPath`, `Collection`). A draft could copy
  such an alias into the declaration (`type DeepPickN<…> = …`), and the
  rows would read better; it would also restate the library's internals,
  go stale with them, and export a name the module has not. Not done: the
  place refers, a copy restates (the note's first conclusion). The remedy
  is the library's — export the type — and `--explain` could say which
  types those are.
- *A predicate as a fn's own result* (`export fn is(x: unknown): x is
  T`). Both parsers take it (a result's type is text), the tree-sitter
  grammar does not, and nothing reads it: TypeScript types the `.rx` call
  against the library's own declaration (TY-4b). The draft keeps
  `boolean` and `void`, which TY-6b allows. A grammar change for a text
  nothing consumes is not worth its four places.
- *A callback's shape kept in the last reading.* There a callback with no
  name is its place whole, so the row has no function type to mark
  `handler`; a person who needs the word writes the signature. A notation
  for "a function, typed by its place" (`handler Parameters<…>[1]`) would
  keep it; it is a new reading of `handler`, so it is only noted.
- *Holding a record's field for every type argument.* TY-6f holds it at
  one instance. A sound "for all `T`" needs TypeScript to read a prop of a
  deferred conditional type, which it does not.


## A fourth round: three libraries the benchmark had not seen

Kobalte left the benchmark and three libraries came in, none of which a
row, a word or a drafting rule had been written against: `@ui-sdk/solid`
0.1.0-beta.13 (Vercel Labs' UI SDK: a headless kit), `@wardic/solid` 2.0.1
(Motion's API on Solid 2: elements, gestures, presence) and `solid-use`
1.0.0 (lxsmnsyc's utilities). Each has a task (`bench/tasks/ui-sdk-dialog`,
`wardic-motion`, `solid-use-primitives`) declared from `rx-declare`'s
draft. This is the first check of the vocabulary (MO-8i) outside the
libraries it grew up with: what it took, and what it could not say.
(The rounds above are records of their runs: their numbers, and what
they say of Kobalte's rows, are as measured then.)

| task | modules declared | rows kept | hand-written words | `any` inherited | introduced | by place | whole drafts: rows / library's `any` / introduced / by place |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ui-sdk-dialog` | `@ui-sdk/solid/dialog`, `/toggle` | 8 components, 1 context | 23 | 10 | 0 | 9 | 71 / 14 / 0 / 12 |
| `wardic-motion` | `@wardic/solid`, `@wardic/dom` | 3 components, 1 fn, 2 values, 1 context | 14 | 0 | 0 | 0 | 285 / 3 / 0 / 40 |
| `solid-use-primitives` | `solid-use/media-query`, `/client-only`, `./use.js` | 6 fns, 1 component | 6 | 0 | 0 | 0 | 12 / 2 / 0 / 0 |

No `any` is the draft's, in the kept rows or in the whole drafts, and
`bench/any-allowlist.json` stays empty. No word was added. One thing was
fixed, because without it one of the three could not be drafted at all.

**The one change: `readonly` before a declared prop (MO-11a).** Wardic's
props are interfaces of `readonly` fields, and a draft writes a record as
the library declares it: `export component LayoutGroup(props: { readonly
children?: View; readonly id?: string | undefined; … })`. Both parsers
refused the modifier there (`PARSE: expected '}'`), though MO-10b already
reads it on a result's fields. One such row and the crate could not read
the draft, so the draft could not be checked against the module, and every
row was written "as every draft was": **726 `any`s of the draft's own**
for `@wardic/solid` (`rx-declare --explain`: "the draft could not be
checked against the module"). With the modifier read (a prop may still be
named `readonly`): 0, and 3 the library's. The units
`a_declared_prop_may_be_readonly` in both checkers; the tree-sitter
grammar read it already. A draft that cannot be checked says so only
under `--explain`: it should fail loudly instead, which is proposed below.

### `trusted`

None is written, and none was needed: the benchmark does not run strict
declarations (MO-8j). Under `--rx-strict` every row of the three packages
would need it, for a reason that is the tool's and not the rows':
`rx-verify` pairs a `.d.rx` with the JS module beside it, and for a
project declaration of a package (`rx-types/<package>.d.rx`, MO-8k's
first place) it answers `no JS module beside dialog.d.rx`. That is 8 rows
for UI SDK, 6 for Wardic, 4 for solid-use; the 3 rows of `use.d.rx`, which
is beside `use.js`, are the only ones it would run. Proposed: `rx-verify`
resolves an `rx-types/` file to the package it declares, as the checker
does.

### `any`, and parts said by place

- *UI SDK, 10 inherited.* All are one type of the library's:
  `RenderProp<State>`, whose first parameter is `Record<string, any>` (the
  props a part hands a custom element), reproduced in the `render` prop of
  each part that has one. `Toggle`: 1; the dialog's parts: 9.
- *UI SDK, 9 by place.* `DialogTitle`, `DialogDescription` and
  `DialogClose` are `PartComponent<DialogPrimitive, "title", "h2">`: their
  props are computed from the core primitive's slot map, and the type has
  no name an app can import. The draft writes the record a field at a
  time, and three fields of each — `class`, `style`, `children`, each "a
  value, or a function of the part's state" over a state type with no
  name — are `Parameters<typeof import("@ui-sdk/solid/dialog").DialogTitle>[0]["class"]`.
  A row that is the props' place whole (`props: Parameters<typeof
  DialogTitle>[0]`) would say the same in one part instead of three; the
  draft prefers a record where it can write one.
- *Wardic, 0 in the kept rows.* In the whole draft 3 are the library's
  (`AnimatePresenceProps.custom?: any`, `Feature<I = any, S = any>`), and
  40 parts in 12 rows are by place: `Reorder`'s and the layout hooks'
  internal types.
- *solid-use, 0.* In the whole drafts, 2 the library's
  (`clientComponent<T extends Component<any>>`).

### Hand-written words

- *UI SDK (23).* `export context dialog`, `provides(dialog)` on the root
  and `uses(dialog)` on six parts (17 words); `handler` on `onOpenChange`
  and on `onPressedChange` (2); `children?: (state: ToggleState) => View`
  on `Toggle` (4). The context is the expensive one, and neither way of
  finding it works here. The module exports no hook, and its context is
  not exported, so running finds nothing (`rx-declare --run --dom`: "ran 0
  hooks"). The package publishes built files only; with a checkout at the
  release's tag, `--source` finds the toggle's contexts (8 suggestions)
  and none of the dialog's (0 for 9 rows): its parts are made by a factory
  (`const dialogParts = createDialogParts(dialogPrimitive, "Dialog", …)`,
  `const DialogTitle = dialogParts.Title`), and the reading does not
  follow a component that is a call's result. What is true was read off a
  run: a part alone throws `<DialogClose> must be used inside <Dialog>`.
- *Wardic (14).* `export context wardic`, `provides(wardic)` on the
  provider, and the row `export component wardic.div(props:
  WardicProps<"div">) uses(wardic)`, which is most of them: the draft has `export
  const wardic: typeof import("@wardic/solid").wardic` and no row for a
  member, since the members are a mapped type over every tag. `--source`
  found the context (`WardicProvider` "renders this context's provider"
  [src/provider.tsx:192]; the elements read it [src/provider.tsx:81]) but
  had no row to write it above. And `pure` and `instantiates` on `ward()`.
- *solid-use (6).* `pure` on six fns. `--source` gives the reason for the
  three it can read (`createSignal` and a listener added in `onSettled`,
  src/media-query.ts:26, :28; src/client-only.ts:15); for the three in
  `use.d.rx` it gives none, because the helper re-exports the package's
  default exports and the reading stops at the helper ("source: the module
  itself (use.js)", 0 suggestions).

### What no word of MO-8i says

Each with the row, what the library does, and what would say it. None
blocked a good program from being written; each decided what the good
program could be.

1. **A module's default export** (solid-use: `atom`, `fetch`, `string`,
   `useServerValue`, `useOnlineStatus`, `usePageVisibility` — six of its
   ten modules). A `.d.rx` declares named exports only; the draft writes
   `// TODO: the module's default export: import it by name in a JS helper`
   and nothing else, so `rx-declare solid-use/online-status` is an empty
   file. The task has `src/use.js` (`export { default as useOnlineStatus }
   from "solid-use/online-status"`) with a `.d.ts` and a `.d.rx` of its
   own. *Needed:* a row for it, `export default pure fn
   useOnlineStatus(): ref boolean`, and `import useOnlineStatus from
   "solid-use/online-status"` in `.rx`. It is grammar, not a word, in four
   places (both parsers, the projection, tree-sitter), and it is the
   largest gap by programs affected: a package in this style cannot be
   imported without a file written for the purpose.
2. **One function that reads and writes** (solid-use `atom<T>(value):
   Atom<T>`, `(): T; (value: T): T`). A result is a reader (`ref T`, read
   without a call) or a function (io, called in a handler): `count()` in
   the view is `IO_IN_REACTIVE` when the row says a function, and `count(1)`
   is not there to call when it says `ref`. The draft's row is the
   function, its type by place. Not in the task. *Needed:* a result word
   for a signal in one value, `signal T` (MO-10h has the word for a
   parameter: "a getter and a setter"), bound as an `.rx` name that is
   read as an equation and written as a setter is called.
3. **A callback the library calls once, while the call or the component is
   made** — synchronously, in the owner, outside tracking. Three rows,
   two libraries:
   - Wardic's `wardRef?: (ward) => void`, "as `ref` gets the element"
     (src/element.tsx:469, under `untrack`). `handler` is false of it, and
     the run shows it: a closure there that calls an action fails with
     Solid's `ACTION_CALLED_IN_OWNED_SCOPE`, and the page does not mount.
     `tracked` is false too. Unmarked, the closure is a pure function,
     which can do nothing with the ward it is given.
   - solid-use's `useServerValue<T>(cb: () => T): T`: `cb` runs once, on
     the server, and is impure on purpose (`Math.random`, an id). The
     draft reads `() => T` as an accessor, `ref cb: T`, which types cannot
     tell from it; as `ref`, the argument must be a pure expression. The
     task's `useTicket` is three lines of JS for that reason.
   - solid-use's `provide(context, value)` (its own injection, beside
     `createProvider` and `inject`): a call that must run while the
     component is made. In `.rx` a call for what it does has no position
     in a component's body (`PARSE`), and in an effect it runs after the
     children were made.

   *Needed:* a third function word beside `handler` and `tracked` — say
   `setup` — for "called once, now, in this owner, untracked": its closure
   is checked as a component's body is (it may bind primitives and declare
   effects; no write, no action). For the third case, the same fact on a
   fn: a call that is a statement of a component's body. The words exist
   in Solid's terms (an owned scope that is not a computation), so CN-8
   has no objection; whether one word covers the three is the question.
   `ref: handler (el) => void` on a declared component (MO-10g) is the
   nearest row today, and what this round saw of `wardRef` says a
   declaration should not use it for a callback run during creation.
4. **A member component under a lowercase name, and a family of members**
   (Wardic's `wardic.div`, Motion's `motion.div`; `w.div` of an instance).
   Two things. *(a)* A tag is a component's by its capital (07 §4), so
   `<wardic.div>` is not a member's tag: it is an element named
   `wardic.div`, accepted by both checkers with no diagnostic and compiled
   into the template as written. The spelling that works is MO-11q's
   alias, `import { wardic as Motion }` and `<Motion.div>` — which reads
   as Motion's own, and which the task and `examples/wardic` use — but a
   person porting Motion code gets a silent wrong program first.
   *Proposed:* a tag with a `.` whose head is a name bound in the module
   is refused, with the alias in the message (no HTML element has a dot
   without a hyphen); or read as JSX reads it, a member whatever its
   case, which is about twenty places in the two checkers. *(b)* The
   members are `{ readonly [Tag in keyof JSX.IntrinsicElements]:
   WardicComponent<Tag> }`: one row a tag, by hand. *Needed:* a row for
   the family, `export component wardic.<Tag extends keyof
   JSX.IntrinsicElements>(props: WardicProps<Tag>) uses(wardic)`, the
   member's name a type parameter of the row.
5. **An element in a prop that is not `children`** (solid-use's
   `ClientOnly`, `fallback?: Element`; every kit's `icon`, Solid's own
   `<Show fallback>`). `.rx` gives a JS component a view as its children,
   a view lambda where the prop is a function (`{view header (n) { … }}`,
   MO-11k), or a component where the prop is `Component` (MO-11c).
   `fallback={<span>…</span>}` is `PARSE`, and a prop typed as an element
   takes none of the three; the task's fallback is a string. *Needed:* a
   named view with no parameters for a prop typed `View`, `{view fallback
   { <span>…</span> }}`, lowered to the element (a getter), not a function.
6. **`children` that is a view or a function of state** (UI SDK, every
   part: `children?: JSX.Element | ((state: ToggleState) => JSX.Element)`).
   A row types `children` as `View` or as a function giving one, and the
   two are told apart at the application (`VIEW_FN_EXPECTED`,
   `VIEW_FN_MISPLACED`). The task's `Toggle` row narrows it to the
   function (MO-8o allows a record to narrow), which is right for this
   app and refuses `<Toggle>Bold</Toggle>` in it. *Needed:* the union
   read as it is written, `children?: View | ((state: S) => View)`: plain
   children, or a view lambda as the only child.
7. **A result that is the library's object and has accessor parts**
   (Wardic's `ward()`: a callable ref that is spread on an element or
   given to `wardRef`, with `settled` and `tapped` accessors that hold,
   `when(name)` and `read(key)` that make a memo each, `next(name)` a
   promise, `each(name)` an async iterable). A result with a `ref` part
   is wrapped — a getter a part (MO-10b) — and the wrapper is not the
   ward: it cannot be spread or handed back to the library. So the task's
   row is `ward(): Ward<{}>`, an opaque value: `card.next("tap")` is
   typed by TypeScript and awaited, and `card.tapped` cannot be declared
   as what holds. And *a method that instantiates*: `card.when("tap")`,
   and solid-use's `fetch(url, init, true).json<T>()`, make a computation
   each time they are called and hand back an accessor; "only the return
   and its tuple or object parts are declared; an accessor nested deeper
   is a value". For `fetch` the draft says "is a class: construct it in a
   JS helper". *Needed:* field words on a result that stays the library's
   own object (read through, not copied), and a function part's own row,
   `json: <T>() => ref pending T instantiates`.
8. **Tagged templates** (solid-use `string`: `` string`Hello ${name}` ``).
   `.rx` has no tagged call (`PARSE`), and a `TemplateStringsArray` cannot
   be built by hand. The draft's row is fine (`string(strings:
   TemplateStringsArray, ...args: unknown[]): ref string`); the surface
   has nowhere to call it. Each interpolation may be a value or an
   accessor, which a rest parameter cannot say either (`ref` on `...args`).
   Not in the task; an `.rx` equation over a template literal is the same
   thing.
9. **A result whose every field is an accessor, for any shape**
   (solid-use `destructure<T>(source: T): Spread<T>`, `{ [K in keyof T]:
   () => T[K] }`). `ref` goes on a field a row lists. Noted only: `.rx`
   reads props where they are used, and has no use for it.

### What the tools should do, short of a word

- *A draft that cannot be checked fails.* When the crate cannot read a
  draft, `rx-declare` writes every row with `any` and says why under
  `--explain` alone. It should exit non-zero with the crate's message and
  the row: this round's 726 would have been one line.
- *Running finds a kit's context without a hook.* `rx-declare --run`
  calls exported hooks. For a module of components and no hook (UI SDK),
  it could render each exported component alone and inside each other
  one, as `rx-verify`'s placement check already does for declared rows: a
  part that throws alone and renders inside the root reads what the root
  provides.
- *The source reading follows a component that is a call's result*
  (`createDialogParts(…).Title`) and a re-export in a helper
  (`export { default as x } from "pkg"`) to the package's own source.
- *A place for a family's evidence.* `--source` found Wardic's context
  and had no member row to put it above.
- *`rx-verify` on `rx-types/`* (above).

### Decided (2026-11-22, the same day: 09 MO-8r)

The round above asked for words. The answer is the other way: the
vocabulary is held to a bar — a word or a form is kept only if, without
it, a correct Solid program people commonly write cannot be written, or a
mistake Solid programs really make cannot be refused, for more than one
library — and what one package does is said without a word: leave the
function undeclared, a few lines of the app's own JavaScript declared in
the words there are, or the library's own types. Applied to what was
already there, eight went (`signal`, `tracked`, `forwards`, `joins`,
`methods`, `renders(root, …)`, `trusted`, a row a signature; MO-8r has
each with its use and its reason). Applied to the gaps:

| gap | decision | what is written instead |
| --- | --- | --- |
| 1. a module's default export | no row for it | `export { default as useOnlineStatus } from "solid-use/online-status"` in a module of the app's own, declared `export pure fn useOnlineStatus(): ref boolean`: one line, and the task has it. It is the gap that touches most programs of a package in this style, and still one package of the benchmark's |
| 2. one function that reads and writes (`atom`) | no word | two functions over it, a reader and a setter, in the same module of the app's own: `[ref T, (v: T) => void]`, which is what `.rx` reads of any signal |
| 3. a callback called once, while the call is made (`wardRef`, `useServerValue`, `provide`) | no third function word | unmarked, the closure is a pure function, which is safe however it is called; what must do io there, or make a primitive, is three lines of JavaScript (the task's `useTicket`). Three rows of two libraries, each doing something else with the callback |
| 4a. `<wardic.div>` compiled as an element | **fixed**: `UNKNOWN_COMPONENT` in both checkers | `import { wardic as Wardic }`, `<Wardic.div>`; the message says so (MO-11q) |
| 4b. a family of member components | no row for a family | a row a member the app uses (`export component wardic.div(…)`): the family is a mapped type, which TypeScript reads from the library |
| 5. an element in a prop that is not `children` | not now | a render prop where the library has one (`{view fallback () { … }}`), a string, or a component of the app's own JavaScript around the library's. It is the nearest to the bar — every kit has an `icon` — and it is a form of `.rx`'s markup, not a word of a declaration; taken up when a second library of the benchmark needs it |
| 6. `children` that is a view or a function of state | no union read | the row narrows `children` to the one the app writes (MO-8o) |
| 7. a library's object with accessor parts, a method that instantiates | no field words on an opaque result | the object stays the library's, typed by TypeScript; a part that must be an accessor is a function of the app's own (`export const tapped = (w) => () => w.tapped()`, declared `ref boolean`) |
| 8. tagged templates | nothing | an `.rx` template is the same value |
| 9. a result whose every field is an accessor | nothing | `.rx` reads props where they are used |

And the two things under *What the tools should do* that were defects
rather than wishes are done: a draft the crate cannot read fails, with
the line and the parser's reason (it was 726 `any`s and a line under
`--explain`); and a draft no longer depends on the install's layout (a
dependency's type was named where npm had hoisted the package and written
out where it had not: found on CI, where a fresh install moved
`primitives-virtual` from 8 hand-written words to 11).

### Outside the vocabulary, found on the way

- An action that starts itself again without awaiting (`action hear() {
  await card.next("tap"); taps := n => n + 1; hear() }`) never shows its
  write: the second run belongs to the first's transition, which is then
  waiting on the next tap. `onFlush(() => { hear() })` starts it after the
  flush (02 EF-8). The checker has nothing to say and probably should
  not; the guide could.
- UI SDK's default build is compiled for the DOM, and its server render
  is the `solid` condition's source, compiled by the app's bundler. The
  benchmark imports a package as Node resolves it, so `ui-sdk-dialog` is
  not rendered on the server there. Wardic through Vite, with the `solid`
  condition, is `compiler/test/wardic.mjs`.

## A fifth round: the whole of solid-primitives and solid-use, and the families of Wardic and UI SDK (2026-11-23)

The fourth round met three libraries through one task each. This one asks
the same of everything those libraries ship: every `@solid-primitives`
package whose latest release accepts `solid-js ^2` (98 of the 110 on npm,
read off each package's `peerDependencies`; the 12 that do not —
`autofocus`, `composites`, `cookies-store`, `countdown`, `db-store`,
`fetch`, `immutable`, `local-store`, `page-visibility`, `reducer`,
`resource`, `stream` — are recorded in `bench/coverage/libraries.json`
and not tested), every module of `solid-use`, and each family of
`@wardic/solid` and `@ui-sdk/solid`. Two things are held for each
(`bench/coverage/`, `bench/README.md`): the module drafted whole by
`rx-declare` with no `any` of the draft's own (MO-8q), and a program that
uses it as its documentation does — accepted by both checkers, typed by
the library's own types, run (rendered on the server and hydrated where
the package allows it). Where reactivity matters the packages are also in
six tasks with their mistakes (`primitives-sensors`, `primitives-listeners`,
`primitives-state`, `solid-use-state`, `ui-sdk-forms`, `wardic-values`).

| library | modules drafted whole | rows | library's `any` | introduced | by place | programs | green | hand-written words |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `@solid-primitives/*` (98 packages) | 107 | 1237 | 127 | 0 | 264 | 98 | 98 | 148 |
| `solid-use` | 10 | 28 | 6 | 0 | 0 | 10 | 10 | 18 |
| `@wardic/solid`, `@wardic/dom` | 4 | 751 | 10 | 0 | 96 | 6 | 6 | 78 |
| `@ui-sdk/solid` | 69 | 2861 | 1052 | 0 | 1159 | 6 | 6 | 9 |
| | **190** | **4877** | **1195** | **0** | **1519** | **120** | **120** | **253** |

`bench/coverage/coverage.txt` has the row of each module (its rows, its
`any`s, the program that imports it, whether it is rendered on the server
and hydrated) and what each entry says of its package.

### What the drafts needed

Drafted as `rx-declare` stood at the fourth round, the 190 modules (and
`@ui-sdk/core`'s 68, which no app imports) held **47 `any`s of the draft's
own**: 24 in solid-primitives, 13 in UI SDK's core, 6 in UI SDK, 4 in
Wardic's `v1`. None is left. Each cause, and what removed it:

| cause | where | what it took |
| --- | --- | --- |
| a tuple's part that is a record written in place (`[value, { stop, start }]`) had no text, and no place | `createTimeAgo` and three more of `date`, `createAmplitudeStream`, `createInfiniteScroll`, `makeGeolocationWatcher`, `createViewportObserver`, `createMutationObserver` | the record as the library writes it (an accessor in it is a value, MO-10b), else the part's place; a result named by an alias with no parameters is read through to its tuple |
| an accessor nested deeper than a result's own fields was drafted `ref`, which the boundary check refuses (MO-10b), and the row fell back to `any` | `createFormControlInput` (`a11y`, `form`) | nested deeper, an accessor is the function it is |
| Solid's `JSX.Element` inside a union printed as `Element`, the DOM's | `resolveRichTemplate` (`i18n`) | a `View`, wherever it is |
| a value or a function of something (`boolean \| ((page: number) => boolean)`) | `createPagination`'s options | TypeScript's text with the function last (the checker reads a function type where a type is one) |
| props whose library type ends in a record (`RangeProps & { fallback?: T; … }`): the record was read as the row's own, and held to the type before it | `Range`, `IndexRange` | written in parentheses |
| a result that ranges over an alias's parameters | `createVirtualList` | what the accessor answers, by its place |
| a file re-exported as a namespace (`export * as Point from "./Point"`) taken for the type declared where the file begins | Wardic `v1` `createProjectionNode` | a declaration is known by its kind too |
| a method that answers a record or `null` lost its `null` | UI SDK `createTriggerMenuController` | kept |
| options with a method generic in itself, taken apart at its bounds | UI SDK core `createPopup` | in the last reading, such options are their place whole |

Four readings were wrong without being `any`, and are corrected:

- a function of nothing that answers `Promise<void>` (`exit`,
  `requestPermission`) was drafted `ref`: a read of the field would have
  called it. It is a function, called for what it does;
- Solid 2's own getter, `SourceAccessor<T>` (what `createSignal` hands
  back: an accessor with a brand), was not seen as an accessor, so a
  signal a primitive hands back was a function value (`createUserTheme`,
  `createControllableSignal`, `createHydratableSignal`);
- a render prop generic in what it gives (`children: (item: Accessor<T>)
  => U`, `U extends JSX.Element`) was not a render prop (`List`,
  `VirtualList`: `VIEW_FN_MISPLACED` at the use);
- an optional parameter that is a type parameter (`initialValue?: I`) was
  written `NonNullable<I>`, which no call satisfies.

One thing types cannot say stays a review's: a function of nothing that
answers a value is drafted `ref`, and `createQueue`'s `remove: () => T |
undefined` takes an item out. The draft's `TODO` says so ("one the app
calls instead is a function"), and the entry's row is corrected by hand.

### Two changes at run time (09 MO-10a)

The first 25 programs compiled, type-checked, rendered on the server — and
16 of them failed hydration: `Hydration key miss`, the page detached. The
packages return early on the server (`if (isServer) return () => true`)
and call `onSettled` or `createEffect` in the browser; each takes an
owner's id in Solid 2 (`getNextChildId` after `onSettled`, `createEffect`
or `createMemo` is one further, on both builds), so everything the
component writes after the primitive is looked for under a key the server
never wrote. It is the library's defect, and a `.tsx` app meets it
unchanged. An `.rx` app does not have to: a declared primitive is now
called in an owner of its own (`__rt.inst`), which is RG-6a's nested
region made real, so to its component it is one child on both sides
whatever it makes. All 16 hydrate.

The second: every `ref` argument was passed as an equation, `__rt.memo(null,
() => "a.mp3")`, a constant too. A library that reads such a parameter
once while it is made (`access(src)`: solid-primitives' `MaybeAccessor`
idiom) then read a reactive value where nothing tracks, and Solid's
development build said so against the app's component. A constant is the
plain accessor now, and the primitive's call is untracked, as a call made
once is.

### What the libraries themselves do

Recorded because each decided what a program could be, and none is
`.rx`'s (each is the same in a `.tsx` app); `coverage.txt` has them entry
by entry.

- *Not rendered on the server (12 programs of solid-primitives and
  solid-use; Wardic's and UI SDK's 12 for the reason the fourth round
  gives).* A module that calls a client-only API where it is loaded or
  rendered (`favicon`, `virtual`'s `<VirtualList>`, `controlled-props`:
  one build, its JSX compiled for the DOM), a primitive with no server
  path (`createDevices`: `navigator.mediaDevices`), and what is the
  browser's by nature (a worker, a websocket, a stream, a position, the
  network).
- *Rendered on the server and mounted, not hydrated (3).* `<Key>` and
  `<Refs>` render their children by another path on the server, so the
  children's keys differ — inside a component, where an owner around the
  call does not help; `createVisibilityObserver` is ready on the server
  and waits in the browser.
- *Broken as shipped.* `createMap()` and `createSet()` hand back a proxy
  whose methods lose their `this` (`Cannot read private member`); the
  classes work (`new ReactiveMap()`). `createTimeAgo`'s effect reads a
  `const` declared after it, which Solid 2 computes where the effect is
  made. `createEventProps` names its props as Solid 1 named events
  (`onclick`), which Solid 2 sets as attributes. `createWorker`'s own
  example (`{ add(a, b) { … } }`) does not survive its serialization (a
  method's text is not an expression).

### What no word says: the gaps this round found

Thirty of the 120 programs have a module of the app's own beside them
(MO-8r's second way). By what the library's shape was, with the decision
on each, by the bar of MO-8r:

| the shape | where | decision | what is written |
| --- | --- | --- | --- |
| a module's default export | solid-use: `atom`, `fetch`, `string`, `server-value`, `online-status`, `page-visibility` | as decided: no row | `export { default as x } from "pkg"` |
| **a function a primitive hands back that the view calls** — a reader, by itself or as a tuple's part | `@solid-primitives/i18n` `translator()`, `marker` `createMarker()`, Wardic's sensors | no word | the function as a *field* of a record the module makes (`{ t }`): a field that answers a value is a read (MO-10b), a function bound by a name is io. Two libraries and the commonest shape here (`t("key")`); the spelling it would take is `pure` before the result's function type, a new place for an old word. Not taken: the same evidence for a name-bound function would read Solid's own `Setter<T>` (it answers the value set) as a reader |
| one function that is two things by how it is called | solid-use `atom` (`(): T; (v: T): T`), Wardic `Sensor` and `IsPresent` (`(): A; (el: Element): void`) | no word | two names for its two uses. Two libraries now, and still no surface: one `.rx` name cannot be both a value read without a call and a function given to `ref` |
| a class the app constructs | `ReactiveMap`, `ReactiveSet`; solid-use's fetch responses | no form (`.rx` has no `new`) | `export const makeMap = init => new ReactiveMap(init)`, declared `instantiates` |
| a component that is a part of a result | `drag-drop` `createDragContext().Provider`, `controlled-props` `[value, set, Field]`, `context` `createContextProvider()` | no form: MO-11f reads a fn whose *whole* result is a component | a component of the module's own that renders it |
| `ref` on a rest parameter | `signal-builders` (`...a: MaybeAccessor<number>[]`) | no | an `.rx` equation says the same (`total = price + tax`) |
| a callback that is handed a callback that is handed a draft | `flux-store`'s `actions: (setState) => …` | no: `draft` is said on a callback's parameter, one function deep | the actions in JavaScript |
| an accessor of a promise | `geolocation` `() => Promise<Coordinates>` | no | `createMemo(() => location())` in the module: an equation bound to it would hold a promise (`MISSING_AWAIT`) |
| a callback called once while the call is made, impure on purpose; a call made for what it does while a component is made | solid-use `useServerValue`, `provide` | as decided | JavaScript |
| a tagged template; a RegExp | solid-use `string`, `graphql`'s `gql`; `marker` | no | `.rx` has neither literal |
| a store whose assignment is the write | `mutable` | no | `.rx` writes its own sources |
| options the library names, with a callback that writes | `script-loader` `ScriptProps`, `idle`, `createShortcut` | no form | the row narrows the options to a record with the fields the app gives, `onLoad?: handler (…) => void` (TY-6b: a declaration may say less) |
| **an element in a prop that is not `children`** | solid-use `ClientOnly` `fallback`; solid-primitives `Key`, `List`, `Range`, `Repeat`, `VirtualList` `fallback`, `createPagination`'s `prevContent` | **accepted**: it meets the bar now (a second library of the benchmark, six components) | until it lands, a string. The form chosen needs no grammar: a component of the app's that takes no props, given by name to a prop typed `View` (`fallback={Empty}`), as MO-11c gives one to a prop typed `Component`. Not in this change |

One limit of the second way itself: a module of the app's own that wraps
a library's hook cannot say `uses(…)` of the *library's* context — a JS
declaration names the contexts its own file declares (MO-12a). Wardic's
`createHover()` needs the provider above it; behind `sensors.js` the
checker no longer knows (the page throws, as in Solid). It is the same
question as a signature that names another package's context
(`rfc-rx-packages`), and is answered there.

Outside the vocabulary, the language's own: `.rx` has no `Math`, no
RegExp literal and no `as`; a store row is one object for its life, so a
library that keys rows by identity (`<Key>`) sees a row's fields change
under a key it already has.

### The three kept on one library's evidence

MO-8r kept `renders(later)`, bare `renders` and `pending`/`fails` on a
result's field with one library each behind them. Against 190 more
modules:

| kept | what the wider evidence has | decision |
| --- | --- | --- |
| `renders(later)`, `renders` on a prop (MO-11o) | a second library asks the same question: UI SDK's `toast()` and `confirm()` open into a registry from anywhere, and `<OverlayHost overlays={…}>`, mounted once, "renders what `toast()` and `confirm()` open" — views that travel in a value and are rendered later, under a host elsewhere | **kept**: two libraries |
| `pending`, `fails(E)` on a result's field (MO-10f) | none of the four libraries hands out a store whose plain fields wait: every waiting value is an accessor (MO-10d) or a promise. But the shape is Solid 2's own — `createStore(fn)` and `createProjection` over an async function are stores whose fields wait where they are read — so it is said of Solid itself and of TanStack Query | **kept**, as `.rx`'s own row words at a field: the rule is Solid's (08 CN-8a), not a library's |
| bare `renders` (MO-11l) | no second library: no module here is given components and renders them where its value is bound | **kept as the first form of the kept word**, and said plainly: one library (a headless table). It adds no word that `renders(later)` does not have, and without it the table's cell components cannot read the app's context |

### Declared by a tool

- `rx-verify` pairs a project's declaration of a package
  (`rx-types/<package>.d.rx`) with the module that import resolves to
  (it answered "no JS module beside"), so its rows can be shown, and
  strict declarations (MO-8j) can be asked of a package the project
  declares. That is what strict mode requires now that no row opts out:
  every row the program imports is one `rx-verify --record` ran — a
  project's declarations included — or the import is left to the
  generated draft, whose rows claim nothing a run could contradict
  (every fn io).
- Of the fourth round's *What the tools should do*: the three left
  (running a kit's components inside each other to find a context no hook
  shows; following a component that is a call's result in the source
  reading; a place to put a family's evidence) are not taken up. Each
  would write a suggestion a person still confirms, and none changes a
  verdict; the contexts this round's tasks declare (a radio in its group,
  Wardic's provider) were read off one run of the page.
- The proposals of the third round stay proposals, for the reasons given
  there: a predicate as a fn's own result (text nothing reads), a copy of
  a library's unexported helper types (the place refers, a copy
  restates), `handler` on a callback said by its place (a new reading of
  the word). Holding a props record for every type argument (TY-6f) stays
  at one instance: the limit is TypeScript's, and the 85 component rows of
  this round's programs hold at it.
