# Declarations: what the tools do

The rules of a declaration are `spec/09-modules.md`'s. This is how the tools draft one, read the code for its words,
audit it, run it and keep it true. Nothing here is a checker's: a checker reads the rows it is given (08 CN-8).

The one reader of what a row means is the crate's parser (`rxc serve`'s `rows`, `src/rows.js`): its name, its claims,
its words, parameters, callbacks and result parts, and the place of each type it writes. `rx-verify`, the placement
checks, the strict record, the audit and the benchmark read that. `rx-declare`'s draft writes rows as text and so keeps
offsets into its own lines (`src/declare-infer.js`).

| tool | what it does | code |
| --- | --- | --- |
| `rx-declare <module>` | a draft from the types, with the words the code proves and a `// TODO` for each thing left to a person | `declare.js`, `declare-check.js`; `infer.js`, `declare-infer.js`; `questions.js` |
| `--why`, `--explain`, `--causes`, `--readings` | why a word was written or not, why an `any`, which reading of a row TypeScript held | |
| `--audit <file.d.rx>` | every word a declaration has: proven, contradicted (exit 1), unproven | `declare-audit.js` |
| `--host`, `--host --routes\|--sync\|--check` | a host declaration, by hand or from a router's tree | `declare-host.js`, `host-routes.js`, a reader for each router in `routes/` |
| `rx-verify [--dom] [--record] [--json]` | each claim of each row, by running | `bin/verify.js`, `verify-place.js`, `render.js`, `strict.js` |

## What `rx-verify` shows

The head of `bin/verify.js` lists each claim and its evidence. A result is about one claim and says `held` (by running,
or `by: code` where the code proves it and no run reached it), `mismatch`, `unverified` or `n/a`. `unverified` is the
answer to a claim nothing ran: no arguments to call with (a probe gives them, `lib.probe.mjs`), no provider of the
context, a module node cannot load, a loader whose data changes, a failure under a provider for another reason than
alone. The record (`--record`) keeps each claim's result by row; strict mode refuses a row with a claim of its own that
is not held.

## What the reading of the code returns

Measured on 2026-11-26 over the 193 modules of the coverage suite's libraries, and the rows the benchmark keeps, each
part switched off in turn:

| part | words drafted | questions (747 with all) | words of kept rows proven |
| --- | --- | --- | --- |
| all of it (`infer.js`) | 1,399 | −241 (988 without) | 109 |
| `handler` | 984, of which 932 are three packages' DOM event maps | −19 | 19 |
| … through JSX (an element's attribute or spread; a component of the module) | 0 | 0 | 0 |
| `uses`, `provides` (contexts) | 46 | −22 | 10 |
| a value made by a call | 38 | −13 | 6 |
| the remainder: `pure` and the rest (`draft`, `rejects`, `instantiates`) | 369 | −187 | 80 |
| the original source (`--source`, 360 lines) | none: it wrote comments | 30 of 731 had one beside it; 16 of 192 packages ship source to read | 0 |

Following a prop through a component of the module, and `--source`, were deleted on that. An element's own event
(`onClick={props.onPress}`, a spread on an element) is kept: it is an app's own component, which the libraries, shipped
compiled, do not show. The rest earns what it costs, `pure` most of it.

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

## Words read from the code that runs (MO-8v)

Three of
a row's words are in no type — `pure`, `handler` on a callback, and
what a promise `rejects` with — and with `draft` on a parameter they
were most of what a person still wrote over a draft (the thirteenth
round counted them: `pure` alone on 81 rows of the benchmark, `handler`
on 33, `pure … rejects(E)` on 24, each a fact about what the code
does). `rx-declare` reads them from the code now. Not the source a
package was built from (MO-8n: that may be another version, and it is
not what runs) but **the JavaScript the import resolves to**: the
app's own module, a package's shipped ES module, every file its export
map can hand an `import` under any condition (`browser`, `node`,
`development`, `solid`, `default` — a word must hold in each build,
and a build that cannot be read stops it; `require` and `types` are not
an `.rx` program's), and each module those import, as far as the code
goes. It is read with TypeScript's parser, a function at a time, to a
fixed point over the calls between them (recursion is taken as proven
until a round shows otherwise; every property only gets worse from
round to round, so it ends).

**A word is written only where the code proves it; everything the
reading cannot see through is a refusal, and the draft is then what it
was** — io, no `handler`, `Error`, and the question asked. What each
word claims:

| word | proven when | refused by, for instance |
| --- | --- | --- |
| `pure` | the call, and all it schedules outside Solid's owner (a continuation after `await`, a promise's callback, a timer it sets), only computes: locals, arithmetic, strings, values it makes; reads of its parameters and of constants of the module that nothing in the module writes through, hands to code that is not read, hands back or exports; calls of functions proven the same way, of the callback it is given (while it runs), of the language's own that only compute (`Math` but `random`; `JSON`; `Object.keys`…; a method of `Array` or `String` that does not change its receiver, one that does on a value the call made), and of Solid's makers of nodes (`createSignal`, `createMemo`, `createEffect`, `onCleanup`…: state of its own, MO-10a). What Solid runs later under the owner — an effect's second function, a cleanup — is not the call's, and is not read | a write to a parameter, to a variable or an object of the module, to a global; `Date`, `performance`, `Math.random`, `crypto`; `console`, `fetch`, `document`, `localStorage`, a listener registered; `this`; a call through a computed member, `.call`, `.apply`, `eval`, `Function`, `import()`; a method that is not the language's (`client.refetch()`); a getter, a `valueOf` or a `toString` of an object the module declares; `toLocaleString`, `localeCompare`; a pattern with a `g` flag; a function of another package that cannot be read; the callback called *later*; a generator |
| `handler`, on a parameter, a field of a record parameter, a component's prop | every call of the callback the code reaches is behind something that calls later and outside any computation: a listener (`addEventListener`), a timer, an observer, a promise's continuation, a statement after an `await` that is passed whatever happens, an effect's second function, a cleanup, an element's event in JSX — through the module's own functions, each read the same way — and it is called at least once | one call while the fn runs (on one branch is enough), in a computation (`createMemo`, an effect's first function), in a built-in's callback (`list.map(cb)`), in a promise's executor, before the `await`; the callback stored (a variable of the module, a record that goes on), handed back, wrapped in a function that is handed back (called whenever its holder calls it), given to a function that is not read (`source.subscribe(cb)`), or its record spread or given whole to one |
| `draft` on a parameter | a write, in the fn's own body, through a name that holds nothing but (a part of) that argument — `list.splice(…)`, `row.done = true` for a `row` of `rows` — during the call, the argument kept nowhere. *Never changed* — every use of it only reads, through every function it is handed to — is proven too, and then the question is not asked | a write through a name that may hold something else, one after the call (a timer), an argument given to code that is not read: neither is said, and the question stays |
| `rejects(A \| B)` | every `throw` and every rejection the code writes or reaches (through its own functions, a promise's executor, a `catch` that throws again) is `new C(…)` of a class the module exports; none at all, and nothing is named — the default stands, and the question goes | a call into code that is not read, a callback, an awaited promise the fn was handed, a thrown value that is no `new C`, a built-in's class (`RangeError`), a class the module does not export, `JSON.parse`: each is `Error`, the row's default, so nothing is written |

*What the reading takes as given*, and says: a parameter is what the
row's type says it is — a method named as `Array`'s or `String`'s,
called on a parameter whose declared type has no function members of
its own, is the built-in (one whose type has — a class's instance, a
record of callbacks — is refused); a function the fn is given is its
caller's, pure where it is called while the fn runs (MO-10g holds the
closure to that at the call) and so no part of the fn's own effect; a
property of an argument is read as data: a getter there (`{ get a() { … } }`
is a `{ a: number }`), a proxy's trap and a `valueOf` are the caller's code
too, and not seen. So `pure` is said of the fn's own code, as CN-5's
assertion is: nothing shows it of every argument, `rx-verify` calls it
`read` and never `held`, and strict mode takes it as read;
what the engine raises for a bug (`undefined.x`) is a panic (04
R-f-10), not a failure, and no part of `rejects`.

**What a constructor runs** (`NEW` in infer.js). One table of ECMAScript's own constructors, from ECMA-262: under which
arguments making one runs no code of anyone's and reads no clock, chance, locale or time zone. Only the global's binding
counts: a name declared in any scope around it, or assigned anywhere in the file, is not it; nor is an alias, `Reflect.construct`.

| constructor | only computes when given | refused |
| --- | --- | --- |
| `Set`, `WeakSet` (`Map`, `WeakMap`; `AggregateError`) | nothing, `null`, a plain list (of pairs): written out, made by the language (`Object.keys`, `.map` of one or of a parameter, an array literal that spreads), a set or a map made there, a rest parameter, a constant of the module — its name never used where its iterator could be changed — or a parameter whose *type* is the language's own list | any other value: its iterator is code |
| typed arrays, `ArrayBuffer`, `DataView` | a length, a list of primitives, a buffer made there | an object that is not known |
| `Error` and its kinds, `RegExp`, `Number`, `String` | a primitive (`RegExp`: or a pattern written out); `{ cause }` written out | a value converted: its `toString` is code |
| `Date` | one number, or one string in UTC | nothing (the clock); a local time, parts, a string that is not known (the time zone) |
| `Array`, `Object`, `Boolean`, `WeakRef`, `FinalizationRegistry`, `Promise`, `Proxy` | anything (a promise's executor is run, and read) | |
| `Function`, `Intl`'s, `SharedArrayBuffer`, the platform's | | always (`URL` and `URLSearchParams` are read as before) |

A requirement on a parameter is asked of each caller the code shows (`bad("…")` for `bad = m => new Error(m)`), and of the
row's type at the export. A class that extends one: `Map`'s and `Set`'s constructors call `set` and `add` of what is made,
so it must be given nothing; none of a proxy, a date, a promise is followed. *A Proxy, and a Date,* may be made and go out
of the call — handed back, in a list, a record or a closure that is — and nothing else (`holds`): every use of a proxy runs
a trap, and a date's text is the time zone's. What calls such a fn is held to the same. Nothing takes either for a plain
value: a reader (`ref`), a constant, a `draft`, a plain argument.

**`pure` and determinism.** The word asks less than this proves: R-io-4
is "no writes to reactive state, and safe to ask again", and a loader
that fetches is `pure`. No reading of code shows that a `fetch` is safe
to ask again, so that much stays a person's to say. What *is* proven
is narrower and stronger — the call computes — and so 10 SV-7c's second
assertion (the same answer on the server and in the browser) holds for
an inferred `pure` by construction: the clock, randomness and the
environment are refusals, the locale's methods are. One reading of the
environment is let through, because every Solid primitive has it: a
*test* of where the code runs (`isServer`, `typeof window ===
"undefined"`, `import.meta.env.SSR`, a constant bound to one), with
each way read, **provided the fn answers no data** — nothing,
functions, accessors, a record of them — since data that differs is
what SV-7c is about and data that is the same cannot be shown
(`whereAmI = () => typeof window === "undefined" ? "the server" : "the
browser"` is refused: `bench/tasks/ssr-divergence`). What an accessor
the call hands back answers when it is read is the accessor's, as it
is for a row written by hand (MO-10b). `rx-verify`'s comparison of the
two sides (SV-7c) is run on an inferred `pure` as on any.

**What is written off the types, and what is not.** A word is the code's or it is not written: none comes off a name
(`create…`, `use…`), a shape or a list of libraries. Two that did are the code's since 2026-11-24:

| word | written where | never off |
| --- | --- | --- |
| `ref` on a result or a part of it | the library's type is Solid's own `Accessor<T>` (`SourceAccessor<T>`, a union with one, an alias of one); or, for a part only shaped as one (`() => T`), every `return` hands out what `createMemo` gives, a signal's getter, or a function of nothing that only computes and writes nothing the call made (`readsPart` in infer.js) | the shape alone: of 148 such parts in the 193 modules 7 were false — an abort signal made anew at each read, an id counted, a `FormData`, a clipboard read, a ref callback — and 10 are proven; the rest are the functions they are |
| `ref` on a parameter | the type is Solid's own accessor | the shape alone: a callback of nothing is a function type |
| `instantiates` | a proven `pure` fn makes nodes of its own; or the call makes what its owner keeps on every path that returns (below) | a name: 248 rows had it |

`Component`, `error` and `View` are the types' own, as the types of a row are.

**`instantiates` without `pure`** (MO-10a). The word says where a call is made: once, where it is bound, in the caller's
region, under an owner whose cleanups run with it. Both checkers give a row with it the same verdicts with `pure` and
without (they read `pure` again only for `import pure`). That making it writes no reactive state but its own is what `pure`
says. So the reading proves only that the call makes something its owner keeps — one of Solid's nodes, a cleanup, a
context read — **on every path that returns**, itself or through a function it calls that does. What else it does (a
listener, the network, a write) blocks `pure`, as strict as it was, and is not asked here.

The word also refuses: a call that is not bound, or from a handler or an effect (`INSTANTIATION_NOT_BOUND`), and a changing
value argument (`SNAPSHOT_ARGUMENT`). So it is not written where a correct call may be one of those:

| refused | why |
| --- | --- |
| a path that returns without it; one behind `&&`, `??`, `?.`, in a loop, a `switch`, a callback | it makes nodes sometimes |
| made later, after an `await`, in a function handed back | there is no owner there |
| under `createRoot`, `runWithOwner`; `onSettled` alone | these need no owner (or name another) |
| `getOwner() ? onCleanup(fn) : fn`, where its answer or `fn` is handed back | made to be called with no owner too |
| a result that is a promise or an undo (`() => void`); a name with a capital (07 §4: a component's) | called in an action or an effect; written in a view |
| plain objects, classes, `new Map` (`createMap`, a router, a headless controller of no Solid node) | nothing of it is the owner's |

Not asked: a path taken only on the server (`isServer`, `typeof window`), which has no handlers; a first `if (…) return;`
that does nothing and answers nothing; what a JSX expression makes is made when it is read, and is no evidence.
`test/infer-owner.js` has each refused form beside its honest twin.
Tried and left out (2026-11-24): proving that each listener, timer and observer is undone under the same owner
(130 lines, 90 cases) — nothing a checker accepts rests on it, and it wrote the word on 4 rows where this writes it on 120.

**`rx-verify` runs each.** A row with a word the code proves is held to what
the reading claims, which is more than the word: a `pure` fn is called
(with a probe's arguments, or none) and must change nothing it was
given, leave no new global, and ask neither `Date.now()`,
`performance.now()` nor `Math.random()` while it is called; a
`handler` must not be called while the fn's own call is still running
(a row written by hand is asked only whether it is called inside a
computation, MO-10g); a `rejects(E)` is run with the probe's arguments
and its failing ones, and what it rejects with must be a class of the
row; a `draft` is run as any (MO-10i). One observation the other way
is a mismatch that says the reading is wrong — a defect of
`rx-declare`, to report — whoever wrote the line. Running can refute a
word and never establish it (RFC 28): the proof is the reading, and
this is its test.

**The questions** (`src/questions.js`). One rule, and no name: a question
is asked only where its answer changes what a checker does.
- A word the code proves is written, and one it refutes (a callback
  called while the fn runs; for `pure`, a clock, chance, the environment,
  work started, data it was given changed) is not: neither is asked.
- A word that leaves the row's *reading* as it is, is not: `pure` and
  `rejects` of a row that instantiates, `handler` in an io fn's row (a
  closure given there is given where it may write already), `rejects` with
  no `export error` to name, and what no word says (a store's field that
  waits). `bench/generated.mjs` holds the reading: rows with one reading
  get one verdict from both checkers in every use.
- Where the code was read, a word is asked about only on a sign of it: for
  `pure`, an answer, with no effect shown; for `instantiates`, something
  made; for `handler`, a callback that answers nothing, kept or not
  followed; for `draft`, the argument written; for `uses` and `provides`,
  a context every call reads that no row is shown to provide (one question
  a context). Where it was not read, the words whose absence refuses a
  correct program are asked: `pure`, `handler`, `draft`.

A question says what the row does now, what the word changes and why it is
not proven (file:line); of a row, the words whose absence refuses a correct
program come first. Several signatures are asked about only where they
differ in what the checker reads. A generated declaration has no questions.
A method's row with no word is drafted all the same (MO-8t): a declared
`const`'s type is the library's, which the checkers do not read, so the row
is what makes a method that answers nothing io; and a fn's method with no
row takes no component (`toast.custom(Card)`). Dropping them was tried
(2026-11-24).

**What it does not reach**, each a refusal with its reason in `--why`,
and each still a person's word where it is true: a value made by a
call (`export const getPerson = query(async id => …)`, a component
made by a factory — the function is an argument, and what the factory
does with it is the factory's); a loader that counts its calls on a
global or reads a table another export writes; a primitive that reads
the page when it is called (`window.matchMedia(q).matches`) or
registers with it then (`addEventListener` in the call, not in an
effect); an object the module exports, which any importer may change;
a callback that reaches an element through a spread of props
(`{...rest}`) or `omit`; a callback of a function the *result* holds
(`bus.listen(listener)`); a package with no ES module to read. A
bundle that is minified is read as any code is — the names in `--why`
are then the bundle's.
Executable: `tooling/rx-language-server/test/infer.js` — 206 functions
that each do one thing `pure` must not cover, 21 for `handler`, 11 for
`rejects`, every one refused with a reason that names the thing, and
their honest twins proven; a package with two builds that disagree;
the draft, `--why`, `--no-infer`; both checkers reading the rows
(rx-tsc over the crate, `ref/`'s checker) with a program accepted for
an inferred word and one refused for a word withheld; and `rx-verify`
over rows that claim what their code does not do.

## Contexts, values made by a call, the audit (MO-8w)

MO-8v left four things
to a person that are in the code as plainly as a write to an argument
is: a prop that reaches an element's event (`handler`), a context a
hook reads (`uses(c)`), a provider around what a component is given
(`provides(c)`), and every row whose export is a value made by a call
(`export const Toggle = rootScope(function Toggle(props) { … })`,
`export const easeIn = named(bezier(0.42, 0, 1, 1), "easeIn")`). This
rule reads them. The bar is MO-8v's, unchanged: **a word is written
only where the code proves it**, and what the reading cannot see
through is a refusal with its place.

*What is taken as known* is Solid's and `@solidjs/web`'s, never a
package's (08 CN-8): a lower-case tag is an element; an element's
`on…` prop is its listener (`onClick={f}`, `onClick={[f, data]}`), its
`ref` is called when the element is made, its `children` are rendered
(a function among them is called in a computation), any other prop is
an attribute; `{...record}` on an element is each of those by its
name; `createComponent(Tag, { … })` is JSX written out, for a package
that ships JavaScript; a context is its own provider (`<C value={v}>`),
and what is written among its children is made beneath it;
`useContext(C)` throws where nothing above provides `C` and
`createContext` was given no default — `undefined` is none, `null` is
a value; `omit` and `merge` hand back a record that reads nothing
until it is asked; a memo computes when it is made unless it is made
`lazy`; `sharedConfig.hydrating` is a test of when the code runs, as
`isServer` is of where.

| word | proven when | refused by, for instance |
| --- | --- | --- |
| `handler` on a prop (and on a callback of a record a fn is given) | MO-8v's rule, followed further: the callback reaches an element's `on…` or `ref` — as an attribute, in `[f, data]`, in a closure written there, through a record spread on the element, through `omit`, `merge`, `{ ...props }`, a rest pattern, or through `Object.entries`/`values`/`keys` of the record where each value goes to a listener | a call while the component renders (`props.onPress()`, `title={props.label()}`, `{props.render()}`); `children` spread on an element (rendered: called in a computation); a component that is not read (`<Mystery onPress={…}>`, a dynamic tag); a prop that is no event of the element; a field `omit` took off (never called: no word) |
| `uses(c)` on a fn, on a component | `useContext(C)` is evaluated on **every** path of the call — a statement of the body that no branch, loop, `try`, `&&`, `?.` or earlier `return` can skip; inside `untrack`, `createRoot`, a memo that is not lazy; through the module's own functions, each read the same way; a component it hands back as its root — and `C` has no default, or has `null` and the code throws on it (`if (!c) throw …`). And a row of the same draft is proven to `provides(c)` | on one path only (a prop decides, an early `return`, a `catch` around it); in a function it hands back or keeps (read when that is called); in an effect; under `runWithOwner(owner, …)` (looked up from that owner: a provider above the call does not answer it); beneath a provider the function renders itself (not from above); a context with a default; a context the code does not show to be the module's (another package's, one looked up by a key) |
| `provides(c)` on a component | a provider of `C` is written in the function, and every use of its props that may be of a view — a prop whose type is an element, a component, a function that gives one, a list or a record of those, or is not known; the record whole, unless `omit` took every such field off it first — is written among that provider's children, or in the `value` it is given. A component that gives its props whole to another of the module (`return <Shell {...props} />`, a factory's `render(props)`) provides what that one does | `props.children` read anywhere else: before the provider (`const kids = props.children`), in a destructured parameter, in `children(() => props.children)` made outside, on a branch without the provider, beside it (`<><C value={v}><Header /></C>{props.children}</>`); a view prop rendered outside it; the props given whole to code that is not read |

**Why the JSX itself is read, not what Solid's compiler makes of
it.** `@solidjs/compiler` (Solid 2's Oxc compiler, `transform()`) was
tried: it emits two programs for one source — the DOM's and the
server's — and they disagree on exactly what is asked here (the
server's has no event at all: `onClick` is not in it; its props are
hoisted into constructors whose getters read `this`), each in shapes
that are that compiler version's (`_$spread`, `_$insert`, `_$ref`,
templates). A reading of the output would be a reading of two
programs and of a version; the source is one program, the facts above
are Solid's documented contract for it, and `rx-declare` then needs no
native addon where a draft is made. What runs is still what is held
to: `rx-verify` imports the module as an app's bundler would have it
(compiled by the project's Solid compiler where it ships JSX) and
runs each word against it (below).

**A value made by a call.** `fnValueOf`: what such a name holds is the
function its factory hands back — every `return` of the factory the
same function value — with the factory's parameters standing for the
expressions it was called with (an environment: parameter → argument,
in the module and under the environment the call is written in), to
six calls deep; through names bound once, members of records written
out, parts taken by a pattern (`const [Provider, useIt] = make(…)`),
`Object.assign(fn, { … })`, `export * as`. The made function is then
read as any is, with three additions: a call of a parameter of its
factory is a call of the argument; a read of what the factory holds is
refused unless it is the same at every call (a function, a primitive
written out, a constant of the module — a counter, a cache, a table
filled when the factory ran, a record the caller wrote out are state
the calls share); and a call is read with the arguments it is given —
a parameter past the last argument is `undefined`, so a branch that
tests it (`if (options?.dirty)`) is not taken. That last is how a
module of the app's own is proven where the library's function is
not: `sortedBy = (list, cmp) => createSorted(list, cmp)` only
computes; `createSorted` itself, which sorts its list in place under
`{ dirty: true }`, does not.

**A context's row, and its name.** A word names a context the draft
declares itself (`export context tabs`): one the module exports by its
export's name (`RouterContext` → `router`), any
other by the name the code binds it to, or by the provider or hook
that names it first. It is declared only where it is the module's own
to declare — made in the package's own files; for a relative module,
in the file itself. **`uses(c)` is
written only beside a `provides(c)` of the same draft**: a context no
row is shown to provide would refuse every program that calls the
hook, the correct ones with them, so it is asked instead.

**The audit: every word, whoever wrote it.** `rx-declare --audit
<file.d.rx>` asks the same reading about the words a declaration
already has — `pure`, `handler`, `draft`, `rejects(E)`, `uses(c)`,
`provides(c)`, `nests(…)`, `renders(H)` — and sorts each:
- *proven*: the code shows it. It is a word `rx-declare` would write,
  and is counted and run as one read from the code;
- *contradicted*: the code shows the opposite, and the exit is 1. A
  `pure` fn that changes in place an argument that is data (a list, a
  record — not an object with methods of its own: a socket whose
  `close` is wrapped is a person's to judge, as a listener registered
  on it is); a `handler` called while the fn runs; a `draft` parameter
  every use of which only reads; a `rejects(E)` beside a `throw` of
  another class of the module, or where every `throw` is read and
  none is of `E`; a `uses(c)` on a fn every call of which is read and
  none of which reads `c`; a `provides(c)` on a component that renders
  no provider, or reads `children` (an element: made where it is
  read) outside it — the last two only of a name another row ties to
  a context Solid makes, since a library that keeps a scope of its
  own is declared with the same words and the reading does not follow
  it;
- *unproven*: neither, with the first thing the reading stops at —
  which is what a reviewer should check.

**`rx-verify`** therefore reports three things about a file's words:
a contradicted word as a mismatch, with what the code does; each
proven `pure`, `handler` and `rejects(E)` run as MO-8v says; and a
count (`words: 12 read from the code, 0 contradicted by it, 3 it
neither shows nor refutes`). `uses(c)` and `provides(c)` are run as
they were (MO-12: the hook with no provider must throw; a part
mounted alone must fail and inside its provider must not).

**What it does not reach**, each a refusal in `--why`:
- a component whose props go into a proxy or a dynamic tag (`<Tag
  {...resolved} />` with `Tag = dynamic(() => props.as)`, a `render`
  prop that takes over): where the element is, and whether the
  library or the caller makes it, is not in the code that is read;
- a context made for a key (`contexts.get(primitive) ??
  createContext(null)`): which one a part reads is a value, not a name;
- a provider that also hands its props to its state (`usePrimitive(p,
  () => ({ ...options }))` with `options = omit(props, "children")`):
  a prop of a type parameter may hold a view, and where the state
  renders it is not read — `provides` is not written, and so neither
  is `uses` on the parts;
- a context a hook of one module reads and a component of another
  provides (two entries of one package, `export context c from "…"`,
  MO-12e): which declaration owns it is not the draft's to choose;
- a function a context's value holds (`useContext(C).router.push()`):
  its code is its provider's, and may read another context — the word
  for `C` is written;
- `renders(H)` and `nests(…)` themselves: a component kept in the
  module's state and rendered by another export (`toast(message)` →
  an observer's list → `<Toaster>`) goes through a value that other
  exports hand out too (`useSonner()`, `getHistory()`), so "beneath H
  alone" is the library's design and not what its code shows;
- a value made when the module loads by code that is not a literal
  (`Object.create(Proto)`), an object the module exports, a loader
  that fetches: as MO-8v.
Executable: `tooling/rx-language-server/test/infer-view.js` — for
`handler` 13 components and fns proven and 17 dishonest twins
refused; for `uses` 10 and 20; for `provides` 8 and 10; for a value
made by a call 6 and 9; the draft, its one line, `--causes`, `--why`;
the audit over a module
with every class of every word; `rx-verify` over the same file, and
over a draft. `bench/tasks/primitives-state` and
`bench/coverage/primitives/sortable` hold the word the audit found
false (`createSorted`, declared `pure` by hand) as a variant
`rx-verify` must report.

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
