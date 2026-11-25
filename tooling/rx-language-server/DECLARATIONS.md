# Declarations: what the tools do

The rules of a declaration are `spec/09-modules.md`'s. This is how the tools draft one, read the code for its words,
audit it, run it and keep it true. Nothing here is a checker's: a checker reads the rows it is given (08 CN-8).

The one reader of what a row means is the crate's parser (`rxc serve`'s `rows`, `src/rows.js`): its name, its claims,
its words, parameters, callbacks and result parts, and the place of each type it writes. `rx-verify`, the placement
checks, the strict record, the audit and the benchmark read that. `rx-declare`'s draft writes rows as text and so keeps
offsets into its own lines (`src/declare-infer.js`).

| tool | what it does | code |
| --- | --- | --- |
| `rx-declare <module>` | a draft from the types, with the words the code proves and a `// TODO` for each thing left to a person | `declare.js`, `declare-check.js`; `words.js`, `row-types.js`, `declare-infer.js` over `compiler/words`; `questions.js` |
| `--why`, `--explain`, `--causes`, `--readings` | why a word was written or not, why an `any`, which reading of a row TypeScript held | |
| `--audit <file.d.rx>` | every word a declaration has: proven, or not | `declare-audit.js` |
| `--host`, `--host --routes\|--sync\|--check` | a host declaration, by hand or from a router's tree | `declare-host.js`, `host-routes.js`, a reader for each router in `routes/` |
| `rx-verify [--dom] [--record] [--json]` | each claim of each row, by running | `bin/verify.js`, `verify-place.js`, `render.js`, `strict.js` |

## What `rx-verify` shows

The head of `bin/verify.js` lists each claim and its evidence. A result is about one claim and says `held` (by running,
or `by: code` where the code proves it and no run reached it), `mismatch`, `unverified` or `n/a`. `unverified` is the
answer to a claim nothing ran: no arguments to call with (a probe gives them, `lib.probe.mjs`), no provider of the
context, a module node cannot load, a loader whose data changes, a failure under a provider for another reason than
alone. The record (`--record`) keeps each claim's result by row; strict mode refuses a row with a claim of its own that
is not held.

## Generated declarations (MO-8l)

A package the
program imports that has no declaration in the first three places of
MO-8k gets one drafted from its TypeScript types, by the tooling, before
the program is read: the Vite plugin before each build, the language
server when a module's imports change, rx-tsc as it analyses. It is
written to `node_modules/.rx-types/<spec>.d.rx` with a first line
`//@ generated <package>@<version> (MO-8l, draft <n>, types <hash>)`,
the hash of the declaration file TypeScript resolves the import to, of
every declaration file that one reaches by relative imports, re-exports
and references (an `index.d.ts` is often only `export * from "./parts"`),
of the entry file of each package it names, and of its package.json, so a
package that changes at the same version (a linked workspace package) is
redrafted too. A draft is written whole (to a file of its own, then
renamed into place, so a build and the editor never read half of one) and
only under `.rx-types/`: an import whose path has a `.` or `..` segment
(`kit/../../src/x`) gets none, since its draft would land beside a source
file and be read as that module's declaration (MO-8a) (both revised
2026-11-21 after review). It is kept while that
version is installed and the drafting rules are draft `<n>`'s, and
redrafted when either moves (a draft written under an earlier rule, one
that guessed `pure`, is redone once though the version stands; one that
must be redone and cannot be, its package's types gone, is removed, so
the import is undeclared rather than read under an earlier rule); a package with no types gets none, and a row
the notation cannot say is left out as a comment, not the whole file.
The draft is `rx-declare`'s (the package is not run):
every fn io (revised 2026-11-21: a name such as `use…` is a convention,
not a fact, so no draft guesses `pure`, and an import nothing reviewed
cannot make the checker accept more; `IO_IN_REACTIVE` on such a call
says where to declare it `pure`), `ref` where the types show an
accessor, components with their props. What types cannot show is
left out: where a component it is given is rendered then takes the
cautious reading (MO-11s); a hook's context (`uses`) and a field that
waits or throws (`pending`, `fails`) are not checked, and fail at run time
as they would in TypeScript, until a project declaration (MO-8k, first)
says them. Under strict declarations (MO-8j) no generated row is
verified. `RX_GENERATE=0`, or `rx({ generate: false })` for the plugin,
turns it off. A draft is per installed copy (revised 2026-11-21 after
review): each import is resolved from the module that writes it, and two
modules whose imports of one specifier reach two installed copies (two
siblings of a workspace, each with its own version) get a draft each,
beside each copy; only imports that reach the same copy and subpath
share one.

## A draft names the library's types (MO-8m)

A row's types are TypeScript's text (MO-8d): the checker reads the
shape around them — `ref`, a function type and its word, `() => void`,
`Promise<…>`, `View`, `Component`, a record's fields — and nothing of
what a name means. So a draft does not restate a type it cannot write
whole, and does not write `any` for it either (as every draft did: 193
of them in the benchmark's declarations). It names the type where the
library declares it, in the first of these ways that applies:
- by the name a module exports it under: the module's own type by the
  alias the draft declares for it (`export type FormStore<TSchema
  extends FormSchema = FormSchema> = import("@formisch/solid/v2")
  .FormStore<TSchema>`, with its parameters' bounds and defaults as the
  library declares them), another package's by `import("<package>").T`,
  looked for under the names the library's own declarations import it
  by (`import("solid-js").Accessor<number>`);
- with the row's own type parameters, as the library declares them
  (MO-8d, a component's too), so a type that ranges over them is
  written: `createForm<TSchema extends FormSchema>(config:
  FormConfig<TSchema>): FormStore<TSchema>`. A component's row keeps
  only the parameters its props name (a polymorphic `as`'s element
  parameter is not one);
- a callback by its own signature, where every part of it can be named
  (`onOpenChange?: (isOpen: boolean) => void`), and a conditional,
  mapped or template type as the library computes it (`Promise<{
  -readonly [P in keyof T]: Awaited<T[P]> }>`);
- a type no module exports (an internal one) by its place in the
  library's own declaration: `Parameters<typeof import("kit")
  .inner>[0]`, a prop `Parameters<typeof import("kit").Dialog
  ["Trigger"]>[0]["onClick"]`. It is the weakest of the four: it says
  "the library's, here" and nothing a reader can use, and it exists
  only where the fn has one signature. MO-8o leaves it few places.

A row written this way must still be one TypeScript holds (TY-6), and
the draft does not leave that to `rx-tsc`: each reading of a row — its
type parameters carried or not, a part said by its place or not — is
checked against the module as TY-6 checks it (`rxc serve`'s `boundary`
on the draft's text, `tooling/rx-language-server/src/declare-check.js`)
before the draft is written; a row takes the reading TypeScript holds
that leaves the fewest `any`s, and the row every draft had where it
holds none. A draft therefore never brings a `DECLARATION_MISMATCH` of
its own making. What stays `any` has a cause `rx-declare --explain`
names (MO-8q says whose it is). `--any` drafts as before this rule.
A generated declaration (MO-8l) is drafted the same way (draft 7: with
MO-8o and MO-8q over the whole draft, one row an export).

## A row's types are the library's declaration's (MO-8o)

MO-8m read a library's
types as TypeScript resolves them, and named what it found. A resolved
type has lost the name it was declared with wherever the library computes
it (a polymorphic component's props, a schema a builder returns), and
only the entry module's exports had names: such a part was written a
field at a time, or by its place. So:
- *A row's types are written from the annotation the library's own
  declaration gives* the parameter, the result, the prop, the bound of a
  type parameter — `object<const TEntries extends ObjectEntries>(entries:
  TEntries): ObjectSchema<TEntries, undefined>` is that row — with each
  name in it rewritten to a module the app can import it from, and the
  row's type parameters as the library declares them (a bundle's rename,
  `TEntries$1`, by the name it was written with). A field of a generic
  type is declared in that type's parameters, not the row's, and its
  annotation is used only where it is the field's type as it stands.
  The resolved type (MO-8m) is what is written where the annotation
  cannot be.
- *A name is looked for in every module the app can import*: the module
  being declared, the modules its declarations import from, every
  subpath the package's `exports` lists (`@formisch/solid/v2/internals`,
  a `./*` pattern by what it matches), the package that declares the
  type, and — for a type another package declares — the packages the
  library depends on; under the name it has *there* (a bundle's
  `Store$1` is `BaseStore` to whoever imports it), the main entry
  before a subpath, a shorter subpath before a longer. A helper alias
  or an interface of fields that no module exports is written out
  (`Many<T>` is `T | T[]`); a generic method is written with its type
  parameters at their defaults. A part with no name at all is still
  said by its place (MO-8m), the last way.
- *A package a row names is the one the library imports* (2026-11-22).
  A type another package declares is named by that package
  (`import("@solid-primitives/utils").Many<Target>`), and "that
  package" is the copy the declared library resolves: found from where
  the library is installed, then from the app's folder. The draft looks
  there, and so does TY-6 when it holds the row (`rx-tsc` resolves a
  bare specifier written in a package's declaration from the library's
  location first; a relative one is the declaration's own). It was
  looked for from the app's folder alone, which made a draft a fact
  about the install: where npm had hoisted the dependency beside the
  app the type was named, where it had nested it under the library the
  alias was written out, and a hoisted copy of another version was
  another type under the same name. The same `package.json` gave two
  drafts on two machines (the benchmark's `primitives-virtual`, eight
  hand-written words on one and eleven on the other). The unit in
  `tooling/rx-language-server/test/declare.js` drafts one library
  three ways — hoisted, nested, nested with another version hoisted —
  and holds the three drafts equal and each accepted by `rx-tsc`.
- *A result the library names is written by that name* where a step at
  a time would say nothing the checker reads (MO-10b: an accessor part,
  a function that answers nothing or a promise): `createForm<TSchema
  extends FormSchema>(config: FormConfig<TSchema>): FormStore<TSchema>`.
- *A declared component's props may be a type*, in place of a record of
  every field: `export component Toggle(props: ToggleOptions &
  Omit<import("@ui-sdk/solid").PartProps<"button", ToggleState>,
  "value" | "defaultValue" | "type" | "onChange" | "onSelect"> & {
  onPressedChange?: handler (pressed: boolean, details:
  import("@ui-sdk/core").ChangeDetails<TogglePressedChangeReason>) =>
  void })`. The type is
  TypeScript's text, up to the `&` before a record that closes the
  props (or to the `)`, where no field is written again:
  `component Portal(props: SelectPortalProps)`); the checker reads
  none of it. The record after it holds the fields the checker reads
  something of — a function type and its `handler`, a
  render prop, `Component`, `catches(…)`, `renders` — each read as a
  record's field always was (MO-11a); a prop it does not list is
  passed as any undeclared prop is (MO-11b), which is what a field of
  a plain type was to the checker already. TypeScript reads the row as
  the intersection it spells: the declaration's `.d.ts` writes it so,
  and the boundary check (13 TY-6) holds the module's component to it
  with the row's type parameters found from the library's type alone
  (`NoInfer` around the record), so a field written again narrows the
  props and never decides what `Option` is. Props that are a union of
  records (a select that holds one option or several) are written this
  way as they stand; no one record is that type. A record alone is read
  as before (S-module-30, the unit
  `a_component_row_may_name_its_props_type` in both checkers; the
  tree-sitter grammar reads both forms).
- *The record is held to the type* (added 2026-11-22, 13 TY-6f). With
  `NoInfer` around it the record takes no part in holding the component
  to the row, and an intersection would hide a wrong field in any case
  (`P & { onPressedChange?: handler (v: number) => void }` is still something
  the library takes). So each field is checked on its own: it names a
  prop the type has (one member of a union at least; any name where the
  props are open), and the type it is written with is one the library's
  type for that prop takes — the same or narrower, never another. A
  record narrows a prop for the program; it does not retype it. The
  direction is the boundary's (TY-6b): what the declaration admits, the
  library accepts; and for a callback, what the library calls it with,
  the callback as written takes. `DECLARATION_MISMATCH` otherwise, on
  the row, with the prop and both types:

  ```
  toggle.d.rx:8:1 - error DECLARATION_MISMATCH: Toggle: `onPressedChange` is written `(pressed: number, details:
  import("@ui-sdk/core").ChangeDetails<TogglePressedChangeReason>) => void` in the record after the props' type, and
  the library's type for that prop does not take it: the record may narrow a prop of ToggleOptions &
  Omit<import("@ui-sdk/solid").PartProps<"button", ToggleState>, "value" | "defaultValue" | "type" | "onChange" |
  "onSelect">, not give it another type (MO-8o)
    Type '(pressed: number, details: …) => void' is not assignable to type '(pressed: boolean, details: ChangeDetails<TogglePressedChangeReason>) => void'.
  ```

  A field the type has no prop for (`onPressChange?: handler …`) is refused
  the same way: it would give its word to a prop nobody reads and leave
  the real one without. A draft's rows are held this way before they are
  written, as they are held to the module (MO-8m). S-module-32, the unit
  `a_props_record_is_held_to_the_props_type` in both checkers.

- *Props with no name, and many of them, are their place.* A part made
  by a factory (`PartComponent<Primitive, "clear", "button">`) has props
  computed from parameters no row can write: its own few beside every
  attribute of its element (177 for a button). Over 24 props, the row is
  `component DatePickerClear(props: Parameters<typeof
  import("@ui-sdk/solid").DatePickerClear>[0] & { render?: … })`, at the
  row's type parameters where it has some, with the fields the checker
  reads, as after a name. Written out such a row was 24 KB, 178 of them
  in one draft, each naming the place three times or more. A reader
  gains a row that fits a line and shows what the checker reads; they
  lose the list of the part's plain props, which the library's types
  (an editor's hover, `rx-tsc`) give. Twenty-four or fewer are still
  written out. `@ui-sdk/solid` 4.46 MB to 0.23 MB, the 193 modules of
  the coverage suite 9.43 MB to 0.96 MB, the longest row 27 KB to 14 KB
  (an event listener component: each prop is a callback); the median
  line is 95 characters, as it was.

Every row is still held against the module before the draft is written
(MO-8m): a row TypeScript does not hold this way is written as MO-8m
wrote it, and one it does not hold that way either as every draft was.

**What is checked, and how often.** The first reading of the whole draft
is checked once. Where TypeScript holds it whole (most modules), that is
all. Otherwise the other readings are made of the rows it left something
to say of, and a row is checked in a reading only if that reading would
say more than one already held; the best untried reading of every such
row is checked together with the others', beside the rows it stands on.
So a draft takes one whole check and a few small ones, where it took
eight whole ones and a ninth of the rows picked (`@wardic/solid`: 146 s
of CPU to 17 s, the same draft). A file is parsed once for the draft.

## `any` is the library's (MO-8q)

A `.d.rx` for a module with types of its own may contain
`any` only where the library's own declared type has `any` at that
position — a bound `T = any`, a `Record<string, any>`, a parameter the
library leaves open — and there it is written as it is: reproduced, not
narrowed. An `any` written where the library has a type (*introduced*)
is not allowed, in a drafted row or a hand-written one: the type is
named (MO-8o), or the part is said by its place (MO-8m). The library's
`unknown` stays `unknown`. A part said by its place
(`Parameters<typeof import(…)>`) is not a way around the rule — it says
nothing a reader can use — and is counted on its own. `rx-declare
--explain` reports the two kinds of `any` apart (`vendor-any` is the
library's; every other cause is the draft's) and the parts said by
place, and `--causes <file>` writes them by row. The benchmark holds
the rule (`bench/README.md`): each task's declarations are counted as
*inherited* (an `any` where the library has one, place by place) and *introduced* (every other);
`bench --check` fails on an introduced `any` that is not on
`bench/any-allowlist.json` with its reason and what blocks naming the
type, and on a task whose `any`s or by-place parts rise above the
recorded scorecard. A module with no types has no library type to
inherit from: its declaration is all there is (13 TY-6c), and an `any`
there is the author's.

*A whole draft holds it too (extended 2026-11-22).* The rule is the
draft's for every export of a module, not only for the rows an app
keeps: `rx-declare` writes no `any` of its own for a module with types.
What it does where it wrote one:
- *The library's `any` is not the draft's.* A reading of a row that
  names the library's type and reproduces an `any` inside it
  (`PipeItem<any, unknown, BaseIssue<unknown>>`) is not the worse for
  it: the readings of a row are ranked by the `any`s the draft adds,
  then by the parts said by place.
- *A bound is written out, however long.* A type parameter's bound that
  is a helper alias no module exports (`TSchema extends Schema$9`) is
  what the alias stands for; a row is not cut to a length.
- *A place is taken at the row's type parameters.* Beside type
  parameters, a part with no name is its place in the signature *at*
  them, `Parameters<typeof import("kit").f<T, U>>[1]` (TypeScript's
  instantiation expression): exactly the library's type for that part,
  where the place at the bounds was another type and the row did not
  hold. Of an overloaded fn, where one signature alone takes that many
  type arguments. An accessor parameter's part with no name is what the
  parameter answers (`ref opts: ReturnType<Parameters<…>[0]>`).
- *A callback is what the library declares.* A predicate is written as
  one (`test: (x: unknown) => x is T`: a function that answers a
  `boolean` is not it); a parameter that is one of the row's type
  parameters is that parameter (`requirement: TGuard`), not its bound's
  signature. What a fn itself answers stays `boolean` or `void`.
- *Options the row cannot write field by field are their type.* A
  record of a parameter's fields is written for its callbacks (MO-10g);
  where a field the library requires has no name a row can write
  (`"~run"`), or a field has no text, the options are the type the
  library declares, or their place.
- *What the library calls `JSX.Element` is an element.* A result the
  app's project cannot resolve (the library's declaration imports a
  module the app has another version of) is read by the name it was
  written with: a function of props to `….JSX.Element` is a component.
  Any other part that does not resolve is said by its place: it is
  whatever the library's declaration is to that project.
- *A function of nothing that gives an element is a render prop*,
  `render?: () => View`: `Component` takes props, and TypeScript does
  not hold a function of one argument where the library calls with none.
- *The last reading.* Where a row would still hold an `any` — a bound
  with no name at all (a recursive helper type), so nothing for the
  row's types to range over — the row has no type parameters and every
  part without a name is its place as it stands, a callback whole
  (`requirement: Parameters<typeof import("kit").f>[1]`); of several
  signatures, the last, which is the one `Parameters<typeof f>` reads;
  a component's props their place, with the fields that have a text
  after it (MO-8o). TypeScript holds such a row wherever the fn has a
  signature, so it is where a draft stops, and it is ranked last: it
  says least.

`rx-declare --readings <export>` prints each reading of a row and
TypeScript's answer to it. `bench/` drafts every export of each module
its tasks declare and counts the same three numbers over the whole
drafts; `bench --check` fails on an `any` of the draft's that is not on
`bench/any-allowlist.json` (an entry with `draft`: the module, the
export, how many, the reason, what blocks naming the type) and on a
task whose whole drafts say more by place than the recorded scorecard.
The coverage suite holds the same over every module of the libraries it
lists (2026-11-23: 190 modules, 4877 rows, none of the draft's own;
47 before, each with what removed it in
`rfc-declaration-types-2026-11-22.md`, *A fifth round*). What that took
of the drafting rules: a tuple's part that is a record is written as
the library writes it, or by its place; an accessor nested deeper than
a result's own fields is the function it is (MO-10b); a value or a
function of something is TypeScript's text with the function last;
props whose type ends in a record are written in parentheses, so that
record is not the row's own; a function of nothing that answers
`Promise<void>` is called, not read; Solid's own getter
(`SourceAccessor`) is an accessor; a render prop generic in what it
gives is a render prop.

## A module of the app's own (MO-8s)

It is drafted as any module is: the words its code proves, and no word copied from another row (a word copied off a row
a person wrote was that person's claim in a generated file: withdrawn 2026-11-24, spec/archive/generated-words-2026-11-24.md).

One reading of a row more (MO-8q): an accessor's options
record where the fn has type parameters of its own (`ref options: {
queryKey: QueryKey; queryFn: () => Promise<TData> }`) is written with
those parameters by name, where it was said by its place
(`ReturnType<Parameters<typeof f<TData>>[0]>`); TypeScript holds the
reading, or the row is the one it was.

## Words read from the code that runs (MO-8v, MO-8w)

`pure`, `handler`, `instantiates`, `uses(c)`, `provides(c)` and the `ref` of a part only shaped as
an accessor are in no type (nor are `draft` and `rejects(E)`, which are asked: a person's). `rx-declare` writes one where the code an import resolves to proves it, and nowhere else.
The proof is a crate's, `compiler/words`; **what it reads, what each word proves and what is assumed is in
`compiler/words/DESIGN.md`**, a line a word. It is a list of what is safe: whatever is not on it gives no word. A missing
word costs a question; a wrong one accepts a wrong program or refuses a correct one.

`src/words.js` asks it (a WebAssembly module of its own, beside the compiler's). `src/row-types.js` gives it what the rows
say of each parameter, read through tsrs in batches. `src/declare-infer.js` writes the words into the rows.

**What is written off the types, and what is not.** No word comes off a name (`create…`, `use…`), a shape or a list of
libraries. `ref` on a result or a parameter is the type's own `Accessor<T>` (`SourceAccessor<T>`, a union with one, an
alias of one); of a part only shaped as one, the code's. `Component`, `error` and `View` are the types' own.

**A row is held to the types.** Every row a draft has is checked against the module as `rx-tsc` checks it (TY-6); one TypeScript refuses is left
out, with a comment, and its export is as an undeclared import's. A result's part that may be absent, or be another value, is no `ref` and no
bare function: it is its type's own text.

**A context's row, and its name.** A word names a context the draft declares itself (`export context tabs`): one the
module exports by its export's name (`RouterContext` → `router`), any other by the name the code binds it to, or by the
provider or hook that names it first. It is declared only where it is the module's own to declare — made in the package's
own files; for a relative module, in the file itself. **`uses(c)` is written only beside a `provides(c)` of the same
draft**: a context no row is shown to provide would refuse every program that calls the hook, the correct ones with them,
so it is asked instead.

**The questions** (`src/questions.js`). One rule, and no name: a question is asked only where its answer changes what a
checker does.
- A word the code proves is written, and one it stops at for a reason a person cannot answer otherwise (a callback called
  while the fn runs; for `pure`, a clock, chance, the environment, work started) is not: neither is asked.
- A word that leaves the row's *reading* as it is, is not: `pure` and `rejects` of a row that instantiates, `handler` in
  an io fn's row (a closure given there is given where it may write already), `rejects` with no `export error` to name,
  and what no word says (a store's field that waits). `bench/generated.mjs` holds the reading: rows with one reading get
  one verdict from both checkers in every use.
- Where the code was read, a word is asked about only on a sign of it: for `pure`, an answer, with no effect shown; for
  `instantiates`, something made; for `handler`, a callback that answers nothing, kept or not followed; for `draft`, the
  argument written; for `uses` and `provides`, a context every call reads that no row is shown to provide (one question a
  context). Where it was not read, the words whose absence refuses a correct program are asked: `pure`, `handler`, `draft`.

A question says what the row does now, what the word changes and why it is not proven (file:line); of a row, the words
whose absence refuses a correct program come first. Several signatures are asked about only where they differ in what the
checker reads. A generated declaration has no questions. A method's row with no word is drafted all the same (MO-8t): a
declared `const`'s type is the library's, which the checkers do not read, so the row is what makes a method that answers
nothing io; and a fn's method with no row takes no component (`toast.custom(Card)`).

**The audit: every word, whoever wrote it.** `rx-declare --audit <file.d.rx>` asks the same proof about the words a
declaration already has, and sorts each:
- *proven*: it is a word `rx-declare` would write, and is counted and run as one read from the code;
- *unproven*: the first thing the reading stops at, which is what a reviewer should check. `nests(…)` and `renders(H)`
  always are.

It never says that a word is false (until 2026-11-26 it did): the reading follows every path, and a line that changes an
argument may be on one no call takes. What shows a word false is a run.

**`rx-verify` runs each.** A `pure` fn is called (with a probe's arguments, or none) and must change nothing it was given —
its data, and what the accessors among its arguments answer; it must also (a primitive's aside) leave no new global, ask
neither `Date.now()`, `performance.now()` nor `Math.random()`, leave the page as it is, answer the same after the other fns the probe has arguments for, and what it answers must not be
changed by a timer it left to run. `instantiates`: called with no owner under Solid's development build, which must report it (a mismatch where the word was read from the code). A `handler` is called by the probe's act: not while the call
runs, not in a computation, and with no owner (one called under an owner is a mismatch). A `rejects(E)` is run with the
probe's arguments and its failing ones, and what it rejects with must be a class of the row. `uses(c)`: the hook with no
provider must throw. `provides(c)`: a part mounted alone must fail and inside its provider must not, in its children and in every other view it is given. A `draft` must change
during the call and not after, and not be kept. `held` is said of a claim a run of that kind could have refuted; `read`, of a `pure` the code proves;
anything else is `unverified`, a word the code proves and nothing ran among it. One observation the other way is a mismatch, whoever wrote the word; against a word the code
proves, it is a defect of `rx-declare`.

**What changed on 2026-11-26.** The reading was `src/infer.js`, 2,283 lines over TypeScript's parser. It followed
everything but a list of shapes known unsafe, and the list was found incomplete twice: of 671 packages written to break it,
about 190 drafts had a false word. The new one has none on those 671, nor on the 757 written against it. Over the 193
modules of the coverage suite (rows with the word, before → after): `pure` 421 → 296, `instantiates` 376 → 226, `handler`
984 → 971, `uses` 25 → 1, `provides` 37 → 1, `draft` 1 → 0, `rejects` 0, `ref` parts 435 → 438. (A third review, the same day, found 17 false `pure`, 47 `handler`,
23 `draft`, 16 `provides`, 9 `instantiates`, 4 `uses` and 5 `rejects` in 1,275 packages, and a hole: a view may call a function of a `pure` fn's answer. `draft` and `rejects` are no longer written, and over the same 193
modules `pure` is 126, `instantiates` 218, `handler` 943, `uses` and `provides` 0: of the 170 `pure` rows lost, 96 are controllers, made of functions that keep state. None is false over those 1,275, the 1,900 before and 900 written around each fix.) `handler` was 10 until a listener given to the platform had the
standing of a JSX handler (compiler/words/DESIGN.md, *A listener*); the two false ones (`toEffect`, `workerScope`) stay out. What was lost and was true: makers of signals
alone or on one path (no owner is needed there), `pure` fns that read `getOwner`, register `onSettled`, make a class in the
call, or read a module object that something else can write.

Executable: `test/words.js` (the rows, the questions, `--why`, both checkers, `rx-verify` over rows that claim what their
code does not do), `test/words-audit.js`, and `test/words-cases.js` over `test/words/cases.json` (516 functions the old
reading's four tests had, refused and proven), `test/words/adversarial.json` (1,661 packages, 475 of them about a listener; facts found by running where a run can show them)
and `test/words/review.json` (1,750 more: the third review's, and those around each fix of it).
`bench/tasks/primitives-state` and `bench/coverage/primitives/sortable` hold a word that was false (`createSorted`, declared
`pure` by hand) as a variant `rx-verify` must report.

## Host declarations derived from a router's tree (MO-14g)

A host declaration restated the route tree by hand, and
`rx-verify` held it to a probe that restated it again: a route file
added, or moved to another layout, changed neither, and the pages went
on being credited what the router no longer did. The router has the
tree; the declaration is now read off it.
- *The pragma.* `//@ routes <source> [<entry.rx>…]` before the file's
  first row says where the nesting comes from, and that the file is
  that source's: `rx-declare --host --routes <source> [<entry.rx>…]`
  writes it whole. To the checkers it is a comment — they read no
  router's file (CN-8) and check the rows they are given, as before.
  A declaration without it is written by hand, as before, and held by
  its probe.
- *The sources.* **TanStack Router's generated tree**
  (`routeTree.gen.ts`): each route's parent is its `getParentRoute`,
  its component the `.rx` file the tree imports as a page (`?rx-page`)
  or the one `.rx` component its TS route file hands the route. **A
  routes directory**, scanned by the project's own
  `filesystem-routing` (its `toPath`, its `buildRouteTree`): every
  `.rx` file a page, nested as that package nests them — the package's
  convention, and no other. **The project's router, as a module**
  (2026-11-24): a project whose convention is its own — a `toPath`, a
  `toRoute` that leaves files out, another router class — writes the
  router once, `export default new PageFileSystemRouter({ dir,
  extensions, toPath, toRoute })`, gives it to the plugin
  (`fileRoutes({ router })`, the package's own option) and names the
  module as the source. The tool imports it and asks it: the router's
  own routes, nested by the package's `buildRouteTree`, each with the
  `.rx` file of its component (`$component.src`, else the file the
  router scanned). Nothing of a convention is recomputed, so any is
  honoured. (Weighed first: the files the plugin writes. It writes no
  manifest — the routes are a virtual module — and its `types` output
  has each path, id and nesting but no file, and for an `.rx` component
  no import to find one by.) A directory named under a Vite config that
  gives the plugin `toPath`, `router` or `routers` is refused, with
  this source to name instead: it had been answered with the default
  tree, in silence. **A router made in `.rx`** (2026-11-25): code-based
  routes — `rootRoute = createRootRoute({ component: Root })`, `export
  router = createRouter({ routeTree })` — in a module of the program.
  The tool compiles that module (as a library, and whatever the
  checkers say of it: the declaration it writes is what the program is
  checked by, so it cannot wait for the check; a parse error still
  refuses), runs it in a child process with a browser's globals
  (happy-dom, from the project, as `rx-verify --dom` runs a library)
  and asks the one router it exports: each route's children are the
  router object's own, and its component is the `.rx` component whose
  compiled function the route was given, found by identity among the
  exports of the program's modules. Nothing of the calls that built
  the tree is read — not `getParentRoute`, not `addChildren`: what the
  router has is what it renders. A route's component must be exported
  (the declaration imports it by name; one that is not is said, with
  the route). The app's entry is named as for any source, and what it
  renders the tree through is the library's own provider
  (`<RouterProvider>`, applied by the entry or by an `.rx` component
  it applies), with what the project's declaration of the package says
  it provides. **A JSON
  tree** (`[{ file, component?, path?, children? }]`), for a host no
  reader is written for. A route with no `.rx` component is left out,
  its children its parent's.
- *What is derived.* The imports of the route components (a module's
  default component by its own name; two of one name told apart, `Page
  as Page2`); the view, nested as the tree is; around it, each entry
  named, with the component of the app's own it renders the routes
  through — the one it applies from the JS module that imports the
  tree (`./routeTree.gen`, `virtual:file-routes`), declared a
  component beside that module (MO-14f); the router's outlet, where a
  layout that does not read `props.children` applies it; and
  `provides(c)` on the view for each context the routes' imports are
  declared to use and nothing they are rendered through provides.
  Where it cannot tell — an entry that applies two such components, or
  none — it says so and writes nothing.
- *Kept true.* `HOST_VIEW_STALE`: the file's rows are not the ones its
  source gives now, with which route and where (`About is a route of
  ./routes and is not in the view`; `Person is among Root's children
  in ./routeTree.gen.ts, and at the top in the view`). `rx-tsc`
  refuses it for every host declaration its program is under;
  `rx-verify` reports each claim of it a mismatch before running
  anything; a build refuses it before the program is read (the
  router's plugin has written its tree by then); the dev server writes
  the file again and says so, since it is the tool running while route
  files are added. `rx-declare --host --check` and `--sync` do each by
  hand. It is the tools' diagnostic, not a checker's.
- *The probe restates nothing either.* `rx-verify` hands the scene the
  routes as its third argument — each with its path and the recording
  component that stands for its `.rx` one — and calls `act(rx, h,
  route)` for each page in turn. A probe builds the router's objects
  from them and names no route: a file added is in the scene the next
  run.
- *The order.* The tree is the router's plugin's to write: it does at
  the start of a build and of the dev server, before a module is
  compiled, so the check reads the tree as it is. Outside a build
  (`rx-tsc` in CI on a fresh checkout that ignores the generated file)
  the tree is generated first — `vite build`, or the router's own CLI —
  as it must be for TypeScript to type a link at all; a tree that is
  not there is said in those words.

*The bar.* It adds no word to a row and no rule to a checker; the
pragma is a line the tools read. What it removes is a mistake that was
accepted in silence — a page credited a layout the router no longer
renders it in — which is a defect whatever the bar says. Three
libraries write the tree it reads (`@tanstack/router-plugin`, TanStack
Start's, `filesystem-routing`), and each of the benchmark's router
tasks is under one: `router-provider`, `router-rx-routes`,
`start-route`, `file-routes`, `start-mode` — five declarations, no
word by hand in any (the three there were had 13, 8 and 7).
