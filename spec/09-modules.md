# 09 — Modules

**Status: OPEN (2026-10-23).** A program is a set of `.rx` modules. This
document says what an import binds, what crosses a module boundary, and what
the checker knows about another module (its signature, never its body). It
makes 08 CN-4b executable. `ref/src/modules.ts` loads a program,
`ref/src/check.ts` checks it module by module, and every runner executes
it: the interpreter, the Solid oracle, and the compiler, which emits one ES
module per `.rx` module (the compiled, server and types runners). `S-module-1` and `S-app-shop` cover it; `S-module-3`
covers a module read by its `.d.rx` (MO-9); `S-module-33` a package written in `.rx` (MO-13).

Rulings: file = module (07, 2026-10-22); a module boundary is a value
boundary (07 §1, 2026-10-22). The rest was taken by default and ruled 2026-10-26 —
see the list at the end.

---

## MO-1 — Instantiation

- **MO-1a.** `import { a, b as c } from "./x.rx"` binds names that `x.rx`
  exports. The path is relative to the importing file.
- **MO-1b.** Each module is instantiated **once per app**: its top-level
  sources, equations and effects exist once, and every importer reads the
  same ones. Module-level state is app state — not a JS module variable: on
  the server an app is a request (SV-4), so nothing in it outlives or is
  shared beyond its request. Dependencies are instantiated before their
  importers.
- **MO-1c.** [ruled 2026-10-25] A module has no markup at its top level
  (`TOP_LEVEL_MARKUP`). The app's view is the entry module's default
  component, `export default component App() { … }`: the runtime mounts it,
  as Solid's `render(() => <App />, el)`. A module imported for its exports
  may have a default component too; it is a component like any other.
- **MO-1d.** [taken by default 2026-10-27] A declaration in a nested block
  may not shadow a name an import bound (`SHADOWED_IMPORT`): rename one,
  `import { filter as keep }`. A declaration that hides an imported
  function turns every call of it in that block into a call of a
  value, which nothing checks before run time (no type checker in the
  loop, 11). Found in round 4 of the AI eval: a component's
  `source filter` hid the prelude's `filter`.

## MO-2 — The value boundary

- **MO-2a.** An imported source is read-only in the importing module:
  `x := …` and `guess x := …` through an import are
  `WRITE_TO_NON_SOURCE` (rule MO-2). The exporting module exports actions as
  its write interface (`export action select(id) { selected := id }`).
- **MO-2b.** `refresh x` and `affects x` of an imported question are
  allowed: they ask, they do not write.
- **MO-2c.** Reading an import is an ordinary read: rows, holds and lanes are
  the same as for a local name (`latest discount` in `main.rx` over
  `catalog.rx`'s question, S-app-shop instant 5).

## MO-3 — Signatures

A module is checked against its imports' **signatures**, never their bodies
(CN-4b). The checker infers a signature for every export.

| export | what an importer sees |
| --- | --- |
| `source x` | a read-only reactive name; its rows (`pending`, `lane`, `fails(…)`); whether it is a question |
| `x = e` | its rows, including `io` when it is bound to an io value |
| `fn f(ref a, b)` | its parameters (value or `ref`, E-9), whether it instantiates (RG-6), its rows, and what a promise it returns rejects with (R-f-8) |
| `action f` | `io` (R-io-2); it never fails (R-f-6) |
| `error C(…)` | an error class (R-f-1) |
| `component C` | its **summary**, below |

A component's summary is what the static application tree needs from it
(R-f-5, RG-7b), reduced to the component's own boundary:

- **what escapes its root:** the failure classes its own readers (and the
  components it applies) let out, which continue at each place it is
  applied, and the provisions it `use`s that nothing inside it provides;
- **per prop:** the classes discharged on *every* path from the
  component's reads of that prop to its root. A class not in that set comes
  out at the application with that application's argument. For
  `children`, the same holds for provisions. A prop an action reads also
  records what the action catches: an argument with another class is
  refused at the application (R-f-6);
- **what a prop renders (MO-11o):** a prop the component gives on, as it
  is, to a prop that renders what its value carries (a router handed to
  the library's provider) is one the component renders in turn: the
  importer names the components its argument carries and checks them
  under what the summary discharges above that place. `.d.rx`: `router:
  renders provides(./tsr.d.rx#router)`;
- **what a prop takes (MO-10f):** the fields of a prop that its type says
  hold or fail where they are read, so that a JS result with such fields
  may be given whole. `.d.rx`: `query: takes(data pending fails(Error))`;
- **what it stores (O-3):** each prop it stores where the stored value
  outlives the component (in a source of its module, or through a
  provision above it), passed on to a component that does included. A
  closure passed for one is checked at the application against that
  place. `.d.rx`: `retains(onPick: module, onFocus: ./form.rx#fields)`.
  And the props it **keeps** (MO-11l, 2026-11-22): those whose value
  never leaves it, so a value `renders` checked where it is bound may be
  given to one. `.d.rx`: `keeps(table, row)`.

The summary is exact for the checks it serves: a class escapes a set of
paths iff it is missing from the intersection of what the paths discharge.

`ref/check.ts --signature file.rx` prints a program's signatures as `.d.rx`
text, and that text is the whole signature: it is read back in place of the
module (MO-9).

```rx
export source products: pending fails(Error) = …      // `= …`: a question (ST-5); `:= …` a plain source
export discount: pending fails(Error)
export pure fn qtyOf(id)
export action setCoupon
export component Panel(props: { title; children: catches(Error) }) shape(roots section; children-at section)
export context who: string
export component Badge(props: {}) uses(./ui.rx#who) shape(roots b)
export component Save(props: { v: unrendered action go catches(nothing) })
```

## MO-4 — Rows at the boundary

- **MO-4a.** An `.rx` import's rows are its signature's. Neither escape
  applies: `import pure { f } from "./x.rx"` where `f` is `io` in the
  signature is `IMPORT_ROW_MISMATCH`, and `fails A | B` on an `.rx` import is
  `IMPORT_ROW_MISMATCH` (both assert rows at the JS boundary only — R-io-4,
  R-f-8, CN-5).
- **MO-4b.** Without `pure`, an `.rx` import is not `io` unless its signature
  says so: a pure `fn` from another module is callable in reactive scope.

## MO-5 — No cycles

- **MO-5.** Modules that import each other in a cycle are `MODULE_CYCLE`.
  Signatures are computed dependencies first; a cycle has no first. (JS
  allows cycles between modules; Rust allows them between a crate's modules
  but not between crates. Here every module is checked as its own unit.)

## MO-6 — Names

- **MO-6a.** Importing a name a module does not export is `NOT_EXPORTED`;
  an `.rx` path that does not resolve is `MODULE_NOT_FOUND`.
- **MO-6b (Lexical across modules).** An imported component, `fn` or
  action resolves names where it was declared, never where it is applied
  (RG-7a). `ui.rx`'s `Badge` calls `initials` from `store.rx`, which
  `main.rx` does not import (S-module-1). The runtimes follow: a binding
  carries its declaring region, and a component's region is owned at the
  application but resolves names from the declaration.
- **MO-6c.** An export is a declaration at the top level of a module.
  `export type T` is importable (`import { T } from "./x.rx"`) and binds no
  value: types are text to the checker (07 §2). (The first text refused the
  import, found by S-ai2-settings.)

## MO-7 — Contexts across modules

- **MO-7 (ruled 2026-10-23).** A context is a declaration (RG-7a), so it
  crosses modules like any export: `export context who: string` in
  `ui.rx`, `import { who } from "./ui.rx"` and `provide who = …` in the
  module that renders `Badge` (S-module-1). Two modules that each declare
  `accent` declare two contexts, and a provision of one is not a provision
  of the other (S-context-1). An imported component's summary names the
  contexts it needs by declaration (`uses(ui.rx#who)`), checked above each
  place it is applied. An exported context's type is its contract on both
  sides (RG-7e): a provider in one module and a reader in another agree
  through the declaration, not through each other.

## MO-8 — Declaration files for JS modules

- **MO-8a.** A JS module may have a declaration file beside it: for
  `import … from "./api"`, the file `./api.d.rx` (an extension `.js` or
  `.ts` on the import is dropped). For every other JavaScript or
  TypeScript module — `./x.mjs`, `./x.cjs`, `./x.jsx`, `./x.tsx`,
  `./x.mts`, `./x.cts` — the file's whole name comes first, `x.cjs.d.rx`,
  then `x.d.rx` (as TypeScript's `x.d.cts`); the first that exists is the
  declaration (revised 2026-11-21 after review; TypeScript's extensions
  added 2026-11-22, when the checker read `x.tsx.d.rx` alone and the
  tooling `x.d.rx` alone). rx-tsc, the boundary check (TY-6) and
  `rx-verify` read the same names in the same order (`beside.js`). It declares each export in
  rows, once, in the same notation as an `.rx` signature (MO-3):

  ```rx
  export pure fn fetchUser(id: number) rejects(NotFound | Offline)   // safe to call from reactive scope (R-io-4); its promise rejects with these (R-f-8)
  export fn saveUser(id: number, name: string) rejects(Offline)     // io: dirty is the default
  export error NotFound                                             // a JS class that is an error class (R-f-1)
  export type User = { id: number; name: string }
  
```

  `pure` is still the only row word that lowers taint and points one way;
  `rejects(…)` defaults to `Error`. In every `.d.rx` — written for a JS
  module or printed for an `.rx` one — `pure fn` is pure, `fn` is io, and
  `action` is an action. A declaration found here that begins `//@
  signature` is not a JS module's: it is the printed signature of the
  `.rx` module the JavaScript was compiled from, and is read as one
  (MO-13a).
- **MO-8b.** With a declaration file, the file is the row, as a signature is
  for an `.rx` import (MO-4a): an import that names an undeclared export is
  `NOT_EXPORTED`; `pure` on the import must agree (`IMPORT_ROW_MISMATCH`
  for an io export); `fails` on the import is refused. Without one, a JS
  import is what R-io-4 and R-f-8 say: io unless `pure`, `fails(Error)`
  unless narrowed at the import. The declaration is unchecked against the
  JS, as `pure` is (CN-5): it is the boundary's one statement, written once
  instead of at every import (S-module-2).
- **MO-8c.** A JS import, relative (`./util.js`) or a package's, stays an
  ES import in the compiled module, for the bundler to resolve; no
  `package.json` `#imports` alias is needed. The one exception is `./api`,
  which is the app's injected API (`createApp({ api })`, CP-4).
- **MO-8d (Type parameters) — proposed 2026-11-18.** A declared fn may
  have TypeScript type parameters, `export pure fn defineRoute<const S
  extends string>(route: { path: S; … })`, and a declared type may too
  (`export type RouteParams<S> = …`). They are TypeScript's text: the
  checker reads none of it, and the projection's `.d.ts` carries it as
  written (TY-1c), so a library's own inference reaches `.rx` code that
  calls it (S-module-8). A declared component may have them too (revised
  2026-11-22: it was a parse error, and a generic component — a kit's
  `Select<Option>`, whose value and callbacks range over the type of its
  options — could only be declared with `any`): `export component
  Picker<Option>(props: { value?: Option; options: Option[]; onPick?:
  handler (v: Option) => void })`, between the name and the props, on a
  member component as on any other (`component Kit.Row<T>(…)`). The
  checker reads none of it there either: each prop is the row it was
  (S-module-29).
- **MO-8e (Optional parameters) — proposed 2026-11-18.** A declared fn's
  parameter may be optional, `export pure fn createDebounced(ref source:
  string, ms?: number): ref string`. A call may leave it out (a trailing
  argument only, as in TypeScript); the `.d.ts` written from the
  declaration and TY-6's boundary check write it `ms?: number`. The
  checker reads nothing more from it (S-module-13).

- **MO-8f (Pinned to a version) — proposed 2026-11-18.** A declaration may
  say which version of a package it was written for, on a line of its own:
  `//@ for @tanstack/solid-query ^6.0.0`. It is a comment to the checker;
  `rx-tsc` refuses the declaration when the installed package is outside the
  range (`DECLARATION_VERSION`), since rows written for one version may be
  wrong about the next. `rx-declare` writes the pin of the version it drafted
  from. Ranges: an exact version, `^`, `~`, `>=`, `>`, `<=`, `<`, joined by `||`.
  The installed version is the one each importer's import resolves to
  (revised 2026-11-21): a declaration consumed from two folders of a
  workspace is checked against the package as each folder has it, and a
  declaration consumed from anywhere in the program counts, not only one
  beside a module (13 TY-6e).

- **MO-8g (Values) — proposed 2026-11-18.** `export const pageSearch:
  Schema` declares a value the module exports (a validator, a config
  object, a symbol): imported, it is read as any import is, never io, and
  projected as `export declare const`. TY-6 checks its type.

- **MO-8h (Rest parameters) — proposed 2026-11-19.** `export pure fn
  pipe(...items: any[]): any` declares a variadic JS function (valibot's
  `pipe`, `clsx`): a call passes any number of arguments after the fixed
  ones. `rx-declare` drafts it from the types; TypeScript checks the
  arguments as it checks the library's own signature.

- **MO-8i (Where a word goes) — proposed 2026-11-20.** Every word of a
  `.d.rx` row sits by one rule, and the words are `.rx`'s own wherever
  `.rx` has the concept:

  | what the word describes | where it goes | words |
  | --- | --- | --- |
  | the kind of fn | before `fn` | `pure`, `server`, `client` |
  | a parameter | before the parameter, as in an `.rx` fn (`fn f(ref n)`) | `ref`, `signal`, `...` (rest); `draft` on a callback's parameter |
  | a value read | before its type, as in an `.rx` row annotation (`x: pending fails(E) T`) | `ref` (an accessor), `pending`, `fails(E)` on a result, a field or a part; `renders` and `catches(E)` on a prop; `handler` and `tracked` on a function type (MO-10g, MO-10j) |
  | what calling it, or rendering it, does | after the signature | `rejects(E)`, `instantiates`, `uses(c)`, `provides(c)`, `renders`, `renders(root, c…)`, `renders(later)`, `nests(…)`, `joins(field)`, `forwards`, `outlet`, `shape(…)`, `methods(m, …)` (02 E-10), a component's `fails(E)`, `trusted` |
  | a pin | a comment line | `//@ for <package> <range>` |

  A row word names the same row as the `.rx` word for it: a field that may
  wait is `pending` (first drafted as `holds`, now refused with the word
  that replaced it), as an `.rx` value that may wait carries `pending`
  (CN-4a). `rejects(E)` is what a returned promise rejects with, `fails(E)`
  what a read or a render throws: the two words keep the two places apart.
  A member component is named as it is written (`Dialog.Trigger`, MO-11q).

- **MO-8j (Strict declarations) — proposed 2026-11-20.** A row is an
  assertion (MO-8b); by default the checker takes it on trust. A project may
  ask that each row be shown instead: `rx-tsc --rx-strict`, or
  `"reactivescript": { "strict": true }` in the tsconfig (the one `-p`
  names, else the nearest; its own setting, else that of the nearest
  tsconfig it `extends`, which TypeScript does not merge for a key it does
  not know). Then every row of a
  declaration the program imports (`fn`, `component`, `error`, `const`)
  must be one `rx-verify --record` ran and found to hold (or found to have
  nothing to run, as a `pure … instantiates` constructor), recorded beside
  the declaration in `<name>.verified.json` by a hash of the row's text
  (every line it spans, comments left out and whitespace collapsed outside
  string literals: `"a  b"` and `"a b"` are different rows); or
  the row must say `trusted`, after its signature (MO-8i), so the trust is a
  word a reviewer reads rather than the default. A row nothing recorded, one
  recorded as a mismatch or as not checked, and one edited since the record
  (its hash changed) are `UNVERIFIED_ROW` (13 TY-7), each saying which and
  what to run. `trusted` changes nothing else: outside strict mode it is
  read and ignored. A row is verified only when every claim the parser reads in it
  was run (revised 2026-11-21 after review): the crate lists them for each
  row (`exists`, `pure`, `uses`, `provides:<context>`, `fields`, `fails`,
  `callbacks:<position>`, `draft`, `placement`; `rxc serve`'s `rows`
  answer). Each context a row provides and each callback position — a
  function-typed parameter, a record parameter's function-typed field, a
  component's function-typed prop (`ref: handler (el) => void`) — is a
  claim of its own (revised 2026-11-21 after a second review): a hook that
  uses `a` answers `provides(a)`, not `provides(a, b)`, and a component's
  export being a function answers none of its callbacks. rx-verify
  reads each row whole, as the parser spans it (a claim on a row's later
  line, `}) provides(theme)`, is the row's), and a claim no check answered —
  one rx-verify cannot run, as `forwards` or `joins(…)` — is recorded as not
  verified, so such a row needs `trusted`. A record carries the version of
  rx-verify's checks it was made with; one from an earlier version (whose
  checks could miss a claim) no longer counts and is said to need a rerun.
- **MO-8k (Where a package's declaration is found) — proposed 2026-11-21.**
  A package import's declaration is the first of these that exists:
  1. the project's, `rx-types/<spec>.d.rx` in the importer's directory or
     one above it (`rx-types/@tanstack/solid-query.d.rx`; a subpath is a
     folder, `rx-types/@ui-sdk/solid/dialog.d.rx`);
  2. the package's own, beside the file the import resolves to (MO-10c) —
     for a package written in `.rx`, the printed signature of the module,
     marked as one and read as one (MO-13);
  3. a shared one, `node_modules/@rx-types/<scope>__<name>/index.d.rx` (a
     subpath: `<subpath>.d.rx`), named as `@types` packages are;
  4. a generated one, `node_modules/.rx-types/<spec>.d.rx`, drafted by the
     tooling from the package's types (MO-8l).

  The project's comes first so that a wrong shipped declaration can be
  replaced without waiting for the package; MO-8f's pin keeps it from going
  stale. The shared declaration of Solid itself is this repository's
  (`declarations/solid-js`, published as `@rx-types/solid-js`, 2026-11-22):
  what an `.rx` program still imports from `solid-js` — the store, whose
  setter's callback is given its draft (MO-10i), `snapshot`, `merge`,
  `omit`, `flush` — the rest of Solid being the language. The compiled import stays `from "<spec>"` (MO-8c). In rx-tsc, a
  package with no TypeScript types of its own is typed by the declaration
  (TypeScript's `@types` fallback answers with its projection, TY-4b), and a
  project declaration is checked against the package's types where it has
  them (TY-6). With none of the four, the import is what R-io-4 and R-f-8
  say, and a component from it is `UNKNOWN_COMPONENT`, whose message gives
  the `rx-types/` path and the `rx-declare` command that drafts it.
- **MO-8l (Generated declarations) — proposed 2026-11-21.** A package the
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
  The draft is `rx-declare`'s from types alone (the package is not run,
  and what `rx-declare` knows of a named library beyond its types —
  `known.js`: a router's `renders(later)` and `nests(…)`, a query's
  field rows, `pure` — is left out here: it is for a draft a person
  reviews, 2026-11-22):
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

- **MO-8m (A draft names the library's types) — proposed 2026-11-22.**
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
  A generated declaration (MO-8l) is drafted the same way (draft 6: with
  MO-8o, MO-8p and MO-8q over the whole draft).
- **MO-8o (A row's types are the library's declaration's; a component's
  props may be a type) — proposed 2026-11-22.** MO-8m read a library's
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
    something of — a function type and its `handler` or `tracked`, a
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

  Every row is still held against the module before the draft is written
  (MO-8m): a row TypeScript does not hold this way is written as MO-8m
  wrote it, and one it does not hold that way either as every draft was.
- **MO-8p (A fn with several signatures) — proposed 2026-11-22.** A
  declaration may hold several rows of one fn's name: they are its
  signatures (TypeScript's overloads), one row each, in the library's
  order.

  ```rx
  export pure fn createEventListener<Target extends TargetWithEventMap, …>(ref target: Target | Target[], ref type_: EventType | EventType[], handler: handler (event: EventMap[EventType]) => void): void instantiates
  export pure fn createEventListener<EventMap extends Record<string, Event>, …>(ref target: EventTarget | EventTarget[], ref type_: EventType | EventType[], handler: handler (event: EventMap[EventType]) => void): void instantiates
  ```

  The checker reads no type, so it cannot tell which signature a call
  takes; it reads the *first* row, and a later row may differ from it in
  types alone. Another word on the row (`pure`, `rejects`, `instantiates`,
  `uses`, `renders`, …), on a parameter both rows have (`ref`, `signal`,
  `draft`, a callback's `handler` or `tracked`), a result of another shape
  (MO-10b), or any word on a parameter the first row has not, is a parse
  error of the declaration, which names the rule: the rows of one name
  are one fn, and a word is a fact about the fn. The declaration's
  `.d.ts` (13 TY-4b) writes an overload per row, and TY-6 holds the
  module's fn to each row. A draft writes a row for each signature where
  the rows agree (up to twelve), and the shortest signature's row, as
  before, where they do not: an overload whose words would differ is a fn
  the notation does not say, and it stays one signature with the others
  left to TypeScript, which types the `.rx` call against the library's
  own overloads in any case (TY-4b). S-module-31, the unit
  `a_fn_may_have_several_rows` in both checkers.
- **MO-8q (`any` is the library's, or it is not written) — ruled
  2026-11-22.** A `.d.rx` for a module with types of its own may contain
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
  *inherited* (for an export, as many `any`s as the draft of that export
  writes for the library's own) and *introduced* (every other);
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
- **MO-8n (Evidence from the library's source) — proposed 2026-11-22.**
  The words of MO-8i that say what a library *does* — `handler`,
  `tracked`, `uses`, `provides`, `instantiates`, a result that undoes the
  call — are in no type, and they are in the source. `rx-declare <module>
  --source [<checkout>]` reads the TypeScript the package was built from:
  a checkout the person names (the package is found in it by its name), the
  `src/` the package publishes, or the sources its source maps carry
  (`sourcesContent`); for a package that ships built files only it says
  so, with the repository and the version to check out. It follows each
  export's implementation — what a parameter, or a field of an options
  object or of a component's props, is given to, through the library's
  own helpers — and answers in Solid's terms and the platform's: a
  callback run inside `createMemo` or an effect's first function is
  called inside a computation (`tracked`, MO-10j); one given to
  `addEventListener`, a timer, an observer, `onCleanup` or an effect's
  second function is called later (`handler`, MO-10g); a `useContext`
  of a context the library makes is `uses(…)`, its provider rendered is
  `provides(…)`; a call that reaches `createSignal`, `createEffect` or
  `onCleanup` makes state the owner keeps (`instantiates`); a function
  handed back that removes, clears or disconnects undoes the call (EF-5a).
  A callback handed to another package's function is followed no further.
  Each finding is written as a comment above the row it is about, with the
  file and line that is the reason — `// SOURCE makeEventListener:
  `handler`: called from addEventListener, after the call and outside any
  computation — `handler`? (MO-10g) [src/eventListener.ts:67]` — and
  never as the row: a word is the declaration's assertion (MO-8b), and a
  reading of syntax is a reason to look, not a proof (the analysis reads
  no types, follows names, and the checkout may be another version than
  the one installed, which it says). The types stay the published
  declaration's: read from the source instead, they are the same rows
  where the source type-checks in the app's project and worse where it
  does not (its own dependencies and compiler options are not the app's).
  Nothing in it names a library (08 CN-8c).

## MO-9 — A signature read in place of its module

- **MO-9a.** `import … from "./x.rx"` where there is no `x.rx` but there is
  an `x.d.rx` beside where it would be: the importer is checked against
  that file, read as `x.rx`'s signature (MO-3), and never sees a body —
  separate checking, as one crate is checked against another's metadata.
  With both files, the `.rx` is the module and the `.d.rx` is not read.
  With neither, `MODULE_NOT_FOUND`.
- **MO-9b.** The text is the signature, all of it (`ref/src/signature.ts`
  prints and reads it; its first line, `//@ signature x.rx …`, says that
  it is one, which matters where a JS import finds it, MO-13a). An importer checked against a printed `.d.rx` gets
  the verdicts it gets against the body: `ref/run.ts` checks this for every
  scenario program with modules, each module against its imports' printed
  text (S-module-3 is S-module-1 with only the text). Beyond decision 5's
  words, a line carries:
  - a source's kind: `export source x … = …` asks a question (ST-5),
    `:= …` does not (`refresh x` and `guess x := …` depend on it);
  - a fn's parameters (`ref`, with their written types), `rejects(…)` (absent:
    the fn returns nothing that rejects — unlike a JS declaration's, MO-8a,
    where absent is `Error`), and `instantiates` (RG-6);
  - `export server fn f(a)` (12 SF-1; `server pure fn` when it is not io);
  - per prop: `catches(*)` where every class is discharged, `provides(…)`
    for children (RG-7b), `unrendered` for a prop only an action reads, and
    the action's name (`action go catches(…)`) for its diagnostics;
  - `uses(…)`: context keys relative to the module (`./ui.rx#who`), and
    `loading` for a reader of a client question that needs a `loading`
    above it (SV-7b);
  - `shape(…)`: what SV-7d's content-model check needs where the component
    is applied — its roots, `closes-p`, `a`, `form`, and `children-at`
    chains.
- **MO-9c.** A `.d.rx` carries rows, not code or types. The compiler binds
  an import's kinds from it (accessor, function, instantiating function,
  action, component) and imports the module's own compiled JavaScript,
  beside it (`x.rx` → `x.mjs`); the types come from the `.d.ts` TypeScript
  emits from the module's projection (13 TY-4c). A program whose module is
  only a `.d.rx` checks and compiles; it runs once that JavaScript exists
  (`ref/`'s runners have none, so S-module-3 is checked only).

## MO-10 — Solid libraries

A Solid primitive is a JS function called once in an owner that hands back
accessors, setters and stores. Its declaration (MO-8) says so in the words a
printed `.rx` signature already has (MO-9b). Nothing is added at run time: the
call is the same JS call, placed where an instantiation goes (RG-6a).

```rx
// media.d.rx, beside ./media.js, or shipped by the package (MO-10c)
export pure fn createToggle(initial: boolean): [ref boolean, (v: boolean) => void]
export pure fn createDebounced(ref source: string, ms: number): ref string
export pure fn createMediaQuery(query: string): ref boolean
export pure fn createEventListener(target: EventTarget, type: string, handler: (e: Event) => void) instantiates
```

```rx
import { createToggle, createDebounced, createMediaQuery } from "./media.js"

export component Search(props: { start: boolean, q: string }) {
  [isOn, setOn] = createToggle(peek props.start)   // once; without peek, SNAPSHOT_ARGUMENT (E-10)
  query = createDebounced(props.q, 300)            // ref: passed as () => props.q
  wide = createMediaQuery("(min-width: 768px)")
  action flip() { setOn(!isOn) }                   // `x = setOn(true)` is IO_IN_REACTIVE
  <button onClick={flip}>{isOn && wide ? query : "off"}</button>
}
```

- **MO-10a (Instantiating JS functions).** A JS declaration's `fn` may end
  with `instantiates`. As E-9 infers it for an `.rx` fn, it is inferred when a
  parameter is `ref` or the return has a `ref` part (a reader handed back means
  the call made nodes), or when a function part of the result hands its
  callback a draft (2026-11-22: a setter that hands out drafts is state
  the call made, `createStore(init): [T, (update: (draft state: T) => …)
  => void]`), so it is written only for a primitive with none of these —
  one that registers a listener. A call is an
  instantiation (RG-6): once, in the caller's region, never re-evaluated; the
  primitive's owner is that region, so its cleanups run with it. Value
  arguments are snapshots (E-10); a `ref` argument is passed as an accessor,
  `() => e` (RG-6b), which is Solid's `Accessor<T>` argument. It must be bound
  (`INSTANTIATION_NOT_BOUND`). A primitive is declared `pure fn`, as a
  printed `.rx` one is (`export pure fn toggle(ref start: boolean)
  instantiates`): making it writes no reactive state but its own, so it is
  called where its value is bound; what it hands back is MO-10b's. `.rx` has no accessor type: `ref` is the one
  word for an accessor at the boundary, in either direction.
- **MO-10b (What the result is).** The return says what `.rx` sees:
  - `ref T` is a *reader*. Bound by destructuring or projection, it is an
    equation of `T`, read without a call (`isOn`, not `isOn()`): the name is
    bound to the accessor and each read compiles to its call, with no node of
    its own. Passed to a `ref` parameter, the accessor is passed as it is, not
    wrapped again. In imperative scope a read is its value, as any
    equation's.
  - A function type is `io` (R-io-3): callable only in imperative scope.
    A primitive's functions write, so `pure` on a part is not offered.
    That is a part bound by a name (`[isOn, setOn] = …`). A function
    field read off a result where it is called is told apart by what its
    type answers (2026-11-22): one that answers nothing, `nextPage: ()
    => void`, is called for what it does, so `table.nextPage()` in
    reactive scope is `IO_IN_REACTIVE`; one that answers a value
    (`getRowModel: () => { … }`) is a read, called anywhere. A promise
    of nothing (`invalidateQueries: (…) => Promise<void>`) is nothing
    to read either. And one that answers any promise (`mutate: (v) =>
    Promise<T>`, `refetch`) starts work when it is called: in reactive
    scope and not awaited, the work starts again on every computation
    with nothing waiting for it and the view is handed a promise, so
    the call is `IO_IN_REACTIVE` there and as a handler attribute's
    value; awaited (`rows = await pager.load(1)`) it is asked, as a
    question is, and from a handler it is called (2026-11-22). *The same evidence, wherever a type is declared
    (2026-11-22).* A component's props type and a context's declared
    type are read a step at a time as a declared result's is (MO-10k):
    `props.onNext()` with `props: { onNext: () => void }`, and
    `c.add(id)` with `c = use cart` and `context cart: { add: (id:
    string) => void }`, are calls of what answers nothing, refused in
    reactive scope and as a handler attribute's value (02 SC-4). The
    code is the io one, `IO_IN_REACTIVE` — the type says a function,
    not which — except where the module itself says it is an action:
    the field of a context that every provision this module writes
    gives a name declared by `action` is `ACTION_CALLED_IN_OWNED_SCOPE`,
    the code Solid's runtime raises for that call (08 CN-1b). The types
    also say what is a primitive: a prop declared `title: string` holds
    no part of a confined value (MO-10k). S-check-3.
  - Anything else, a store or a plain value, is a value. A store's fields
    track at run time as Solid's do. A store passed *in* is likewise passed as
    itself; an `.rx` structured source is a store behind a signal slot (11), so
    a whole write (`todos := next`) swaps it, and a value parameter misses
    that: `SNAPSHOT_ARGUMENT` stands (`peek todos` says it is meant), and an
    API that takes an accessor of a store declares `ref`. The store keeps
    one identity for its life (Solid's does): a write changes what it
    holds, not which object it is. A library that knows its data changed
    by the data's identity (TanStack Table's `data`) is given a fresh
    list — `[...rows]`, or its adapter makes one — as a Solid app gives
    it one (`bench/tasks/table-pagination`).
  - A record or a tuple none of whose parts is an accessor is the
    library's own object, as it is (2026-11-22; it was a copy with a
    getter per declared part, which hid every field the declaration left
    out and called the library's methods on the copy): only a result with
    a `ref` part is wrapped, to call the accessor where the part is read.
  - Only the return and its tuple or object parts are declared; an accessor
    nested deeper is a value.
  - TypeScript's `readonly` is a modifier, not a shape (proposed
    2026-11-19): `readonly [ref T, …]` (an `as const` result) is a tuple,
    and `{ readonly width: number }` has the field `width`. Libraries such
    as `@solid-primitives` return both; S-module-20.
- **MO-10c (Where a package's declaration is).** Beside the file the import
  resolves to, as MO-8a's is beside a relative module and a `.d.ts` beside its
  `.js`: `@solid-primitives/media` resolves through the package's `exports`
  with the build's conditions to `dist/index.jsx`, and its declaration is
  `dist/index.d.rx`. No export condition is needed. A subpath matched by
  `*` patterns takes the pattern Node takes (`PATTERN_KEY_COMPARE`): the
  longest part before the `*`, then the longest key, whatever the keys'
  order (S-module-26). A package whose
  conditions resolve to more than one file ships the declaration beside
  each; the rows of one export are the same in every build.
  A package that ships none is declared by the project in
  `rx-types/<spec>.d.rx`, a shared `@rx-types` package or a generated draft
  (MO-8k); a local module that re-exports it (`./media.js` with
  `./media.d.rx` beside it, MO-8a) still works.
  Without either, the import is what R-io-4 says, and `import pure` of a
  primitive is unchecked (CN-5): the call is then lifted (E-9) and re-runs,
  rebuilding the primitive, whenever an argument changes.
- **MO-10d (Holds; Ryan 2026-11-13).** Solid promises nothing about an
  accessor: any read can hold. A reader bound from a `ref` result is checked
  as a reader of a question (ST-5): `pending?`, `latest` and `loading` apply,
  with whatever hold checks a reader of `await` gets. Its hold is visible
  where it is bound, at the instantiation, as a question's is at its `await`.
  No declaration can say an accessor never holds.
- **MO-10e (What stays the library's).** A call to a foreign setter is not a
  write of a source: O-4 and AC-1 see only `.rx` sources. So a read of `isOn`
  after `setOn(v)` in the same action reads the value before the write, under
  Solid's batching, and AC-1d cannot say so; the guide teaches it. A plain
  closure passed as a callback option is unchecked, as O-4a's is.
- **MO-10f (Fields that hold or fail) — proposed 2026-11-18.** A field of
  a declared result may start with `pending` and `fails(…)`: `useQuery(…): {
  data: pending fails(Error) T; isFetching: boolean }`. The result is still a
  value whose fields track (MO-10b); a read of that field, `todos.data`, is
  checked as a question's reader is (MO-10d): it carries `pending` (so
  `pending?`, `latest` and `loading` apply, and CN-3d asks for a `loading`
  above it in a client-only build), and it can fail with the named classes
  (R-f-5: an `errored` or a `catch` above it). A part bound from the field
  (`{ data } = useQuery(…)`) is a reader with the same rows. A nested
  record field has them too, kept by its path (`{ result: { data: pending T }
  }`: `q.result.data`), and a record part bound from the result keeps its
  fields' (`r = q.result`, then `r.data`). The spelling of the read does
  not matter: `q["data"]` (a string or whole-number key, or a template with
  no holes) is `q.data`, and a key the checker cannot name (`q[k]`) may be
  any field at that depth, so the read has every such field's rows combined,
  as a part bound from it does (`r = q[k]`). This is a store
  whose property read suspends and throws, as `@tanstack/solid-query` 6's
  `data` does; nothing changes at run time. A result with field rows is
  instantiated (MO-10a, inferred). The words are taken out of the type text
  the projection writes (TY-1c). Executable: S-module-11.

  **The result is read a field at a time (ruled 2026-11-22).** The check
  is complete only if every read of a held field is one the checker sees,
  so the result is not a value the program holds: its name, and a path to
  a record of held fields (`q.result`), stand only where a field is read
  from them (the object of `.` or `[…]`), where an equation gives them
  another name (`q = orig`, `r = q.result`), where the rest of a
  destructuring names every held field beside it, and where they are
  compared or tested (`orig == null`, `!orig`, a condition, the left of
  `&&`). Anywhere else — passed to a component or a call, returned by a
  closure or a fn, provided, exported, written to a source, spread, put
  in a record or an array, shown — is `RESULT_AS_VALUE`: on the other
  side the field would be read as a plain value, under no boundary the
  check asked for. What travels is the field: `<List items={todos.data}
  />` carries `data`'s rows to where `List` reads the prop (R-2, R-f-5),
  as a provision and an export carry theirs. *Guarantee:* in a program
  the checker accepts, a held field of a declared JS result is read only
  by a path written from a name bound to that result, and each such read
  is checked as a question's reader is; the compiled result reads each
  field where it is read (the library's own object, read by its fields;
  with an accessor among its parts, a getter per part, `__rt.lazy`), so a
  read of one field is no read of another. It rests on the declaration alone
  (which fields hold or fail), as every row at the JS boundary does; a
  row word written where no record field takes it — a tuple's part, a
  member of a union, a type argument — is refused in the `.d.rx`
  (`PARSE`), not ignored. No value is followed: the rule is on where a
  name is written. (The earlier revisions followed the result through
  aliases, records, closures and calls to find where its fields were
  read, and counted a result passed whole as a read of every field; each
  round found another way through, and the server render of an accepted
  program still threw. S-module-11; `compiler/test/ssr-held.mjs` renders
  the accepted programs on the server and shows the refused ones were the
  ones that threw.)

  **Its operations are its declared fields (closed 2026-11-22).** "The
  object of `.`" was read as any member: `q.valueOf()` is such a read,
  and what an inherited method answers is the result itself, which a
  child then read `.data` of under no boundary (the fourth review; the
  server's render threw). The result's declared type is the closed set of
  what is read from it: a member read from a result with held fields, or
  from a record of held fields below it, names a field of the
  declaration (`q.data`, `q["status"]`, `q.result.data`); one that does
  not — a method every object has (`valueOf`, `toJSON`, `toString`,
  `hasOwnProperty`), a field the declaration leaves out — is
  `RESULT_AS_VALUE`, as is a call through a key the checker cannot name
  (`q[k]()`; uncalled, `q[k]` is still some field's value with every
  field's rows). A declared function field is called (`refetch: () =>
  void`, then `q.refetch()` from a handler): it is the library's, and
  what it answers is its declared type. So the only values an accepted
  program reads out of the result are its declared fields', and no
  expression's value is the result. A field the declaration leaves out
  has no rows the checker could ask a boundary for: the refusal says to
  declare it.

  **The whole result, through an interface that keeps its fields' rows
  (2026-11-22).** A Solid app passes a query down, and "pass the field"
  is not always what the child is: a panel that shows the data, the
  status and a retry reads several. A component says a prop is such a
  result in the prop's type, with the row words on the fields: `props:
  { query: { data: pending fails(Error) Todo[]; status: string } }`.
  In that component `props.query` (and another name for it, or a
  record of held fields below it) is held to the result's closed set —
  read a field at a time, each held read checked as a question's reader
  is, where it is — and at an application a result, or a record of held
  fields below one, is given whole to such a prop when the prop's type
  marks every field the result holds or fails with, at least as its
  declaration does (`pending` where it holds; every class it fails with,
  `Error` covering all). Anything less is still `RESULT_AS_VALUE`: a prop
  typed `any`, a field typed without its words, `pending` alone for a
  field that fails. The interface is in the component's summary (MO-3:
  `query: takes(data pending fails(Error))`), so it holds for an
  imported component; the row words are `.rx`'s and are dropped from the
  type TypeScript sees (13 TY-1c), where the library's result is
  assignable to the record. *Guarantee:* unchanged — a held field is
  read only by a path written from a name bound to the result, or from a
  prop whose type declares it held, and each such read is checked.
  S-module-11; `bench/tasks/query-forward`.
  `each_confined_value_has_a_closed_set_of_operations` (the crate,
  `ref/units.ts`); `compiler/test/confined.mjs`.
- **MO-10g (Callbacks) — proposed 2026-11-18, revised 2026-11-21.** A
  declaration marks a function type `handler` where the library calls it
  later, outside any computation, as the DOM calls an event handler
  (`useMutation(ref options: { onSuccess?: handler () => void })`,
  `debounce(callback: handler (...args: any[]) => void)`): a value word,
  before the type (MO-8i), on a parameter, a field of a record parameter,
  or a declared JS component's prop. A closure passed there literally, in
  the call's arguments, is checked as a handler's is: its body is
  imperative scope (W-1, IO-2), so it may write sources and call io. It is
  not part of the call's value (it runs later, not now). Everywhere else a
  closure made in reactive scope is still pure (SC-3), and a
  statement-bodied one is `REACTIVE_WRITE_IN_OWNED_SCOPE`. On a declared JS
  component, a prop the declaration types as a function is what the
  declaration says, whatever its name (revised 2026-11-21, after review):
  marked `handler`, it is a handler (its closure imperative scope, passing
  it not a read); a function type without the word, plain or `tracked`, is
  pure, so `onCompare: tracked (v: number) => number` takes no write
  although its name begins with `on`. The name's reading (SC-4) is kept for
  a prop the declaration does not type as a function (`onPick: any`) or
  does not name, for `.rx` components, and for elements. `ref` is a handler
  on an element (07 §4), whatever it is passed; on a component it is a prop
  as any other (revised 2026-11-21 after review): the component, not the
  DOM, decides when to call it, so a declared `ref: handler (el) => void`
  is a handler, `tracked` or an unmarked function type is pure, and a `ref`
  the declaration does not name is pure. S-module-28.

  A function type alone is not a callback (the revision): the same type
  `(a: number, b: number) => number` is a comparator the library calls
  while it computes, or an event it fires later, and only the declaration
  can say which. Taking every function type as a handler (the first
  draft) made a missing word grant a write that Solid refuses at run time,
  and a declaration drafted from types alone (MO-8l) would have granted it
  everywhere. So the word grants it; without it the closure is pure, which
  is safe however the library calls it. `rx-declare` suggests `handler`
  (a `// TODO`) for a function-typed parameter or field named `on…`.

  `rx-verify` checks the word by running (2026-11-20): it calls the fn
  with its probe's arguments, each function-typed parameter wrapped in a
  spy, and asks Solid (`getObserver()`) whether the library called it
  inside a computation. A `handler` called outside tracking holds; called
  inside one, it is a mismatch (a closure there would have its reads
  tracked and its writes refused). An unmarked one is pure, which holds
  either way; called outside tracking, the report says `handler` would let
  it write. Never called under the probe, it is unverified.
  Executable: S-module-12.
- **MO-10j (Tracked callbacks) — proposed 2026-11-20.** Some libraries
  call a function they are given inside a computation of their own, not
  later as a handler: TanStack Query's `useQuery` runs `fetch`, and so
  `queryFn`, in the projection that computes `data`. A closure checked as a
  handler there would be wrong twice: its reads are tracked by the library,
  and Solid refuses its writes. The declaration says so with `tracked`
  before the function type (a value word, MO-8i): `queryFn: tracked () =>
  Promise<any>`, on a parameter, a field of a record parameter, or a
  component's prop. A closure passed there is not a callback: it is checked
  as any closure made in reactive scope is (SC-3), a pure function, so a
  statement body is `REACTIVE_WRITE_IN_OWNED_SCOPE` and an io call is
  `IO_IN_REACTIVE`. `tracked` before anything but a function type is
  refused. Since MO-10g's revision an unmarked function type is pure too:
  `tracked` adds what the library does with it (its reads are tracked by
  the library's computation), which `rx-verify` checks by running: a
  `tracked` callback called inside a computation holds, and one called only
  outside tracking is reported (a `handler` would do).
- **MO-10h (Signal parameters) — proposed 2026-11-19.** Some primitives
  take a Solid signal, a getter and a setter, and wrap it
  (`@solid-primitives/storage`'s `makePersisted`, `utils`' `wrapSetter`).
  An `.rx` source is not one, and the program needs none: `signal init: T`
  on the declared parameter says the library takes a signal, so the
  program passes the initial value and the compiler makes a Solid signal
  of it (`__rt.signal(…)`; to TypeScript, Solid's own `Signal<T>`, so TY-6
  checks it against the library's overloads). The value is read once, as
  an instantiation's arguments are (E-10: `peek` for a source). Nothing in
  the program can write the signal made for it except through what the
  library hands back, which MO-10b already reads: `[theme, setTheme] =
  makePersisted("light", { name: "theme" })`, a reader and a setter called
  from handlers. `signal` implies `instantiates`. S-module-21.
- **MO-10i (A library's drafts) — proposed 2026-11-19.** Some libraries
  hand a callback a value to change in place: Solid 2's store setter calls
  it with the store's draft (`setStore(s => { s.done += 1 })`), and the
  write is the library's, inside its setter. A declaration marks such a
  callback parameter `draft`: `(update: (draft state: T) => T | void) =>
  void`, on a fn's parameter or on a function part of its result (the
  setter of `[store, setStore] = makeStore(…)`). In a closure literal passed
  there, a path of that parameter is written with `:=`, as an equation
  writes its own draft (ST-3): `setTodos((d) => { d.done := d.done + 1;
  d.items[len(d.items)] := text })`, compiled as a plain assignment
  (`d["done"] = …`). The draft itself is not reassigned; the callback
  returns the new value instead. Every other path write stays refused
  (W-1, `WRITE_TO_NON_SOURCE`, with the reason): a parameter the
  declaration does not mark, a local, a captured `.rx` value, so a source
  is never changed behind its writes. The trust is the declaration's, as
  every row at the JS boundary is: TY-6 checks the type with `draft`
  removed, and TypeScript checks each value written against the draft's
  field. Solid 2's store is a proxy read field by field, so its declared
  first part is a value, not `ref`. A path write takes an updater as a
  source's write does (W-6): `d.done := v => v + 1` assigns `f(d.done)`,
  its place evaluated once (revised 2026-11-21 after review): the object up
  to the last key, then that key, then the old value read from them and the
  new one written there, as `x[k] += 1` is, so `d.items[next()] := v => v +
  1` calls `next` once and updates one element.

  **A draft is a place, not a value (ruled 2026-11-22).** The draft lives
  as long as the library's call of the callback: a library may take it
  back when the callback returns (a revocable proxy; Solid's setter stops
  taking writes). Three local rules keep it there, with no value followed:

  1. *Its name stands only in its own callback.* A closure made inside
     the callback may run later, so it may not name the draft, to write a
     path or to read one (`DRAFT_ESCAPES`). The one exception is a path's
     updater (`d.n := v => v + d.step`), which is applied where it is
     written. An `await` ends the library's call, so the callback has
     none. A loop is the statement `for (const x of xs) { … }` (07 §5),
     whose body is the callback's own scope; a turn of a loop over a path
     of the draft is a place of the draft, written by path (`for (const t
     of d.items) { t.done := true }`).
  2. *A read of it is a copy.* Wherever a draft — its name, a path below
     it, what a method called on one answers — is read as a value, the
     compiled code copies it (`__rt.copy`: arrays, plain objects, Maps and
     Sets copied through, a cycle once; an iterator run to its end and
     kept as an iterator over copies; a primitive, a function, a Date,
     an instance of a class is itself): `let n = d.done`, `saved := d`,
     `keep(d.sub)`, `[d]`, a `let` a later closure captures. What goes
     straight back to the library is not copied — a value written to a
     path of the draft, the callback's result, an argument of the draft's
     own method (`d.items.push(d.last)`) — nor what an operator makes a
     primitive of (arithmetic, a comparison, `!`, a template, a condition,
     a key, `len(…)`). A local bound to a read is a copy, so its paths are
     not written (`let a = d; a.done := 1` is `WRITE_TO_NON_SOURCE`).
  3. *The function that hands the draft is called by its own name, with
     the callback written in the call.* A name whose declaration has a
     `draft` callback parameter — the fn, or the setter bound from its
     result — is not passed, stored or given another name, a result
     holding one is read a part at a time (`st[1]((d) => …)`), and the
     argument at the draft's position is a closure literal: so every
     callback that is ever handed the draft has a parameter the checker
     knows is one. A change is shared as an action that calls the setter
     — or as a *named callback* (2026-11-22): a closure bound by an
     equation or a local (`bump = (d) => { d.done := d.done + 1 }`) whose
     name is written only as the argument, at the draft's position, of a
     function that hands that position a draft, and which is called by
     that function's own name (`setTodos(bump)`). Its parameter is then
     the draft and its body the callback's, checked as one where it is
     written; every other use of the name — a call by hand, an argument
     elsewhere, a value stored, shown or exported — is `DRAFT_ESCAPES`
     where it is written, so the closure is never handed anything but a
     draft, and never by anything but the library. The uses are read off
     what is written, before the body is walked; the walk holds the name
     to them. A function that is not such a closure (a prop, a
     parameter, what a call answers, a closure that answers a closure)
     is refused as before.

  4. *What is called on a draft is a method of plain data, by name
     (closed 2026-11-22).* `draft` says the library hands out plain data
     — arrays, plain objects, Maps, Sets — so a method called on a draft,
     a path below it, or what such a method answers is one of theirs (or
     a string's or a number's, for a field that is one), and the checker
     knows each by its name. The closed set:

     | methods | what the call is |
     | --- | --- |
     | `push` `pop` `shift` `unshift` `splice` `reverse` `fill` `copyWithin` `set` `add` `delete` `clear` | a write of the draft: its arguments go to the library as they are |
     | `includes` `indexOf` `lastIndexOf` `at` `slice` `concat` `join` `flat` `with` `toReversed` `toSpliced` `get` `has` `valueOf` `toString` `toLocaleString` `hasOwnProperty`, and a string's or a number's (`trim`, `split`, `toFixed`, …) | a read: what it answers is a copy where it is kept (rule 2) |
     | `keys` `values` `entries` | a read whose answer is an iterator: kept, it is run to its end and is an iterator over copies |
     | `forEach` `map` `filter` `find` `findIndex` `findLast` `findLastIndex` `some` `every` `flatMap` `reduce` `reduceRight` `sort` `toSorted` | calls the function it is given, now, with parts of the data: that function is a closure written in the call, and its parameters are places of the draft, as a loop's variable is — read as copies (`kept.push(row)` keeps a copy), written by path (`row.done := true`), named in no closure made inside it, with no `await` |

     Any other method (`d.items.each(…)`, `d.items.push.bind(…)`,
     `d.valueOf.call(d)`), a method named by a key the checker cannot
     read, and a function made elsewhere given to one that calls it
     (`d.items.forEach(keep)`) are `DRAFT_ESCAPES`: what would be done
     with the live parts cannot be seen. (The fourth review: `d.items.
     forEach((row) => { kept.push(row) })` kept live rows, since the
     closure names no draft; `d.items.values()` was kept as it was, since
     an iterator is neither an array nor a plain object; reading either
     after the library took its draft back threw.) The syntax around a
     call no longer says what the call does: the name of a method of
     plain data does, and nothing else is called.

  **A draft given to JS (2026-11-22).** A draft read where a JS fn is
  called was a copy like any other read, and said nothing: a helper that
  changes what it is given — `moveItem(d.items, from, to)`, the way
  Solid's own documentation uses a store (`setStore(s => {
  arrayMove(s.items, a, b) })`) — changed the copy, and the store stayed
  as it was, with no error at build time or at run time. A draft is never
  copied into JS silently now; there are two cases, and the declaration
  says which:
  - *The fn changes it: the parameter is declared `draft`.* `export fn
    moveItem(draft list: T[], from: number, to: number): void` says the
    fn changes `list` in place, during the call, and keeps nothing of it
    — the same promise `draft` makes of a callback's parameter, read the
    other way round. A draft's path written there is given as it is (no
    copy), and the call is a write of the draft, as the draft's own
    `splice` is. What such a parameter may be given is a draft, or a
    value the code made itself (a literal, a local of its own). The value
    of a source, an equation or a prop, a provision, and a store read
    beside its setter (`moveItem(board.columns, …)` outside
    `setBoard(…)`) are `MUTATION_IN_PLACE` (02 W-1a): the fn would change
    them behind their writes. A fn with a `draft` parameter is not
    `pure` (a parse error in the declaration). TY-6 checks the type with
    `draft` removed; `rx-verify` runs the fn on a draft and checks that
    the change is in the draft when it returns.
  - *The fn only reads it: the parameter is not marked.* It is lent a
    copy (`__rt.lend(d.items, "show")`): the fn may keep it, as before,
    and nothing it holds is the library's. In a development build (the
    one Solid's `DEV` marks) what is lent refuses to be changed, in its
    arrays and plain objects at any depth, with an error that names the
    fn and both remedies: declare the parameter `draft`, or pass a value
    of its own (`[...d.items]`). So the mistake the first paragraph
    describes is an error the first time the code runs, in the helper's
    own stack. A production build lends the plain copy.
  Why both, and not a refusal: reading a draft out into JS is what
  `record("items", d.items)` and every logging and analytics call does,
  and it is safe by the copy; refusing it would cost the common case to
  catch the rare one. And why not `draft` alone: whether a JS function
  mutates its argument is not in its type, so no check of a declaration
  can find the missing word — only running can, and the development
  build is where it runs. `rx-declare` asks the question as a TODO for a
  fn that answers nothing and takes an array or a record.

  *Guarantee:* in a program the checker accepts, no value `.rx` holds
  after a draft callback returns is the library's draft or a live part of
  it, and no `.rx` code names the draft after its callback returned. The
  first half is by construction (the copy), the second by rules 1, 3 and 4.
  It rests on the declaration (which parameter is a draft, MO-8j's
  `rx-verify` runs it) and on what `draft` says the library hands out:
  plain data — arrays, plain objects, Maps, Sets — which is what a store
  or a draft library proxies. JS the callback calls with a copy has a
  copy; JS it calls at a `draft` parameter has the draft for the length
  of the call, on the declaration's word that it keeps nothing. `rx-verify` checks the row by running it: the setter must hand
  its callback an object, and a write to it must be kept (a library that
  hands a copy is a mismatch). A draft whose objects carry methods of
  their own under those names is, like one that hands out instances of
  its own classes, outside what `draft` says. S-module-25; `examples/formisch` runs
  Solid 2's own store this way, and `compiler/test/drafts.mjs` runs the
  guarantee against a library that revokes its draft: every read of it,
  through every way an expression hands a value on and every pair of
  them, is read after the revocation. (The earlier revisions took a path
  read for a copy, which a nested proxy is not, and followed the draft
  through locals, records and calls to refuse a write of it to a source;
  each round found another carrier. Nothing is followed now, and nothing
  is refused that only reads.)
- **MO-10k (Confined values: local rules, and a closed set of operations
  for each) — ruled 2026-11-22, closed the same day.** Four checks keep a value where the checker can see what is
  done with it: a result with held fields (MO-10f), a library's draft
  (MO-10i), a value `renders` checked where it is bound (MO-11l, and the
  values `renders(later)` carries, MO-11o), and the instance a primitive
  made (E-10, E-5a). Three revisions answered them with one analysis of
  "what values may this expression hold", followed through aliases,
  records, calls and closures; each review found a way through it and a
  program it refused for nothing, because following values through a
  language with first-class functions and no types here is neither sound
  nor precise. The stance is 08's (the checks are sound, over-approximate
  and modular; the JS boundary is the declaration's), so the rules are
  now ones whose soundness is local:

  - *A place, or a path root, is not a value at all.* A draft and a
    result with held fields are restricted by where their name is
    written (MO-10i, MO-10f); a draft's reads are copies. No value of
    theirs is tracked through the program: there is none to track.
  - *By mention.* For the other two, a value **may be, or hold a part
    of,** a confined value when its expression mentions that value's
    name, or a name bound to such an expression: an equation's or a
    local's value, a destructured part, the list a `for` row or a loop's
    variable goes through, an effect's `$n`, a parameter of a closure
    handed it in the same call, a parameter of a fn, an action or a named
    closure of this module called with it, what such a fn returns. A
    mention does not count where what is written cannot be handed on: an
    operand of an operator that makes a primitive (arithmetic, a
    comparison, `!`, `typeof`), a template, a condition, a key, the
    argument of `len`, `str`, `sum`, `every` or `indexOf`; and a closure
    gives what it returns, not what it captures (what it does with a
    capture is checked where it is written). A call is opaque: its result
    may be anything it was given. This is a syntactic over-approximation
    of every way `.rx` hands a value on, so it has no cases to miss
    inside `.rx`; and it is modular, because a value never reaches where
    the rule cannot look: each way out of the module or the region (a
    prop, a provision, an export, a source, a thrown value, a call that
    may keep it) is where the check refuses it (MO-11l) or stops naming
    it (MO-11o).

  **What the analysis follows, said exactly (closed 2026-11-22).** "No
  value is followed" was too short. Nothing follows a *value* through
  the program's runs. What is followed is *names*, through what is
  written: a name to the expression it is bound to (an equation's, a
  local's, a destructured part's), a `for` row or a loop's variable to
  its list, a parameter to the arguments its calls pass (for a fn, an
  action or a named closure of this module, and for a closure written in
  a call), a fn's or an action's call to what its body may return, a
  call of a closure to the closures the callee's value may hold — and,
  where what is written names one slot of a literal (a field of a record
  literal, an index of an array literal), to that slot alone. Each step
  is syntactic and over-approximates; none reads a type or runs
  anything. What is *not* followed is anything about JavaScript: what a
  JS function keeps, returns or calls is its declaration's word, and
  the next paragraph is what that word must be.

  **A closed set of operations for each (closed 2026-11-22).** The
  fourth review found one mistake under four accepted programs: the
  syntax around a JS method call — "the object of `.`", "a method of the
  value itself", "a closure that names no draft", "a callee that is not
  a name" — was taken as evidence of what the method answers, keeps or
  calls. It is not: `q.valueOf()` answers `q`; `({ f: props.f, t:
  table }).f(table)` is not a method of `table`; `d.items.forEach(…)`
  hands its callback live rows; `box.read()` runs a closure. So each
  confined kind has a closed set of operations, and a method is granted
  an exemption only on positive evidence of which operation it is — a
  name the declaration gives, or the name of a method of plain data:

  | kind | its operations | the evidence | anything else |
  | --- | --- | --- | --- |
  | a result with held fields (MO-10f) | read a declared field (by `.`, `[…]`, a rest that names the held ones); call a declared function field; another name by an equation; compare, test | the field is in the declared result type | `RESULT_AS_VALUE`: an inherited method (`valueOf`, `toJSON`), an undeclared field, a call through a computed key |
  | a library's draft (MO-10i) | read a path (a copy where kept); write a path; loop over a path; call a method of plain data from MO-10i's table | the method's name is an Array's, a Map's, a Set's, a string's or a number's; a function it calls is a closure written in the call | `DRAFT_ESCAPES`; what a known method answers is copied, an iterator run to its end |
  | a `renders` value (MO-11l) | read and render it in its region; give it to a `pure` JS fn, or to a prop of an `.rx` component that keeps it; call a method `methods(…)` names on its own name; let a part out that its declared type says is a primitive | `methods(…)` and the declared result type; `pure` | `RENDERS_ESCAPES` where a call that may keep it is given it or a part of it |
  | a primitive's instance (E-10, E-5a) | name it, pass it whole; call a method `methods(…)` names on its own name or an alias's | `methods(…)` | a read of what may change: `SNAPSHOT_ARGUMENT`, `SNAPSHOT_KEPT` |

  The declared result type is read as text, a step at a time
  (`ty_step`): a field of a record type, what a function type answers,
  an element of an array type; a type the text does not spell out
  (`any`, a named type, a union of several shapes) says nothing, so the
  strict reading stands. `rx-tsc` checks the text against the library's
  own types (13 TY-6), so the evidence is the declaration's, checked as
  every row at the boundary is.

  What it costs is precision, on purpose: a field read out of a
  `renders` value is the value's (`row.original` may hold a component
  for all the checker knows) unless its declaration says it is a
  primitive (`rows: { id: string }[]`, then `row.id` is free) or the
  program makes one of it (`str(row.name)`); `w = [clock]; w[0].format()`
  is a read through what may be the instance, though it is the
  instance's declared method. What it
  buys is that the guarantees below are properties of the rules, shown by
  tests that put each value through every way of handing it on and every
  pair of them into every way out (`a_renders_value_leaves_through_no_way_out`,
  `a_read_through_what_may_be_an_instance_changes`,
  `a_result_with_held_fields_is_never_a_value`,
  `a_draft_is_named_only_in_its_callback`,
  `each_confined_value_has_a_closed_set_of_operations`: in the crate and in
  `ref/units.ts`), not a list of the cases a review found; and by
  `compiler/test/confined.mjs`, which runs the fourth review's four
  programs: each verdict in both checkers, and what the program does.

  **The JS boundary.** What JS does with a value it is given is the
  declaration's to say, as everywhere (CN-3b, CN-5): a `pure` fn keeps
  nothing and hands what it is given back only as its result, so a
  confined value may be passed to one (its result is confined again); an
  `io` fn, a method the declaration does not name, a method of another
  value, and anything the checker cannot name may keep it, so a `renders`
  value is refused there; a draft passed to JS is lent as a copy, unless
  the parameter is declared `draft`, which is given the draft itself
  (MO-10i, "A draft given to JS"); a result with held fields is not
  passed. Nothing about JS is inferred: not from a method's receiver, nor
  from the shape of the expression it is called in.

## MO-11 — Solid components and routers (taken by default 2026-11-13; veto here)

A Solid component is a JS function from props to a view. Its declaration
(MO-8) says so, and `.rx` applies it as it applies its own. A JS function may
also hand back a component, which is how `@solidjs/router` 2.0 makes its
router from a route table, and either may take components as values where
the declaration asks for them. Nothing is added at run time: an application
is the same JSX, a factory's call is MO-10's once-only call, and a component
value is the compiled component.

```rx
// router.d.rx, beside ./router.js (`export { createRouter, useParams, useNavigate } from "@solidjs/router"`)
export type Params = Record<string, string>
export type RouteDefinition = { path?: string; component?: Component; children?: RouteDefinition[] }
export pure fn createRouter(config: { routes: RouteDefinition[] }): Component
export pure fn useParams(): Params instantiates
export pure fn useNavigate(): (to: string) => void instantiates
```

```rx
import { createRouter, useParams } from "./router.js"
import { fetchPerson, NotFound } from "./people.js"

component Layout(props) {
  <nav><a href="/">Home</a> <a href="/people/1">Ann</a></nav>   // the router handles a link's click
  <main>{props.children}</main>
}
component Home() { <h1>People</h1> }
component Person() {
  params = useParams()                      // once, in the page's region (MO-10a); a store: params.id tracks
  person = await fetchPerson(params.id)     // per-route data: asked again when the param changes
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <h1>{person.name}</h1> }
  }
}
Router = createRouter({ routes: [{ path: "/", component: Layout, children: [
  { path: "/", component: Home }, { path: "/people/:id", component: Person }] }] })

export default component App() {
  <Router />
}
```

- **MO-11a (Declared components).** A JS module's `.d.rx` may declare a
  component: `export component Link(props: { href: string; children?: View })`.
  Each field is a TypeScript type (TY-4b): `View` for a view (07 §6),
  `Component` (`Component<P>`) for a component value (MO-11c). A field may
  start with `catches(…)`, what the component discharges for it (MO-3).
  TypeScript's `readonly` before a field is a modifier, as on a result's
  (MO-10b), and no part of the prop's name: `{ readonly id?: string }`
  declares `id` (2026-11-22: it was a parse error, and a library whose
  props are an interface of `readonly` fields — Wardic's — could not be
  drafted at all: one such row and the whole draft could not be checked,
  so every row fell back to `any`). A prop may itself be named `readonly`.
  After the props, `fails(…)` says what escapes its root and `shape(…)` what
  SV-7d needs where it is applied (MO-9b's words). Absent, each is empty.
  The application is any component's, `<Link href="/">home</Link>`, and it
  lowers to the import as a JSX tag; with no children it is JSX's `<X />`,
  with no `children` prop (an `.rx` component's is an empty view). A JS
  import applied without a declaration is `UNKNOWN_COMPONENT`, and the
  message names the line to write.
- **MO-11b (What the checks see).** A declared JS component is one step of
  the static application tree, with its declaration as its summary (MO-3):
  an argument's failures, and its children's (RG-4c), continue at the
  application unless the field `catches` them, a prop it does not declare
  included; it needs no provision. What its own body reads is outside the
  graph (CN-3b): its pending is not seen, and its failures are not in the
  row unless `fails(…)` names them. Solid's boundaries take them at run
  time, as they take a panic (CN-6b).
- **MO-11c (Components as values).** A component, declared in this module
  or imported, and named with a capital as its tag would be, may be the value of a JS component's prop whose declared type
  is `Component` (`<Shell header={Title} />`), or sit anywhere inside the
  record and array literals of a factory's arguments (MO-11f). Those are the
  only places a component is a value (`COMPONENT_AS_VALUE` elsewhere): `.rx`
  has no way to apply a value, so only JS takes one. The checker checks it
  as applied there, with no arguments, among the children of the
  application (for a factory, of every application of the component it made):
  what escapes it (R-f-5), the provisions it uses (RG-7b), a first load it
  waits on (CN-3d) and its content model (SV-7d) are checked above that
  application, on every path, whether or not the library ever renders it.
  Its props are the library's (`params`, `location`, `children`) and carry
  no rows. It lowers to the compiled component itself.
- **MO-11d (Hooks).** A library's hooks are MO-10's primitives. `useParams`
  and `useLocation` hand back a store, a value whose fields track at run
  time (MO-10b), so `id = params.id` follows the URL. `useNavigate` hands
  back a function, which is io (R-io-3) and called from an action or a
  handler. Each is called once, in the component's region (MO-10a), which
  is where Solid's `useContext` finds the router. A hook called with no
  router above throws at run time, unless its declaration names the
  router's context: then it is `CONTEXT_NOT_FOUND` (MO-12).
- **MO-11e (Route data).** A route's data is an `await` equation over its
  params, in the route's component: `person = await fetchPerson(params.id)`.
  A change of `params.id` is a new question, held as any re-ask is (H-2); a
  newly matched route mounts its component, whose question holds where
  nothing above it shows a fallback. Its failures and its first load are
  checked above `<Router />` or in the page (MO-11c). The router's `query()`
  is a JS function: wrapped in a JS module and declared `pure fn`, it is
  awaited like any other, and its cache is the library's. A route's
  `preload` is a closure handed to JS, unchecked (MO-10e).
- **MO-11f (Component factories).** A JS fn whose declared result is
  `Component` hands back a component: `createRouter(config): Component`. Its
  call is an instantiation (MO-10a; `instantiates` is inferred from the
  result), so it is bound once (`Router = createRouter({ … })`), and the
  bound name is a component, applied in a view (`<Router />`) and never read
  as a value. The components in its arguments are values there (MO-11c).
  The checker knows what the call was given only in the module that makes
  it, so an importer sees the made component through a summary (MO-11j). For SV-7d
  the made component has no element of its own: what it was given is
  checked where it is applied, and counts in the shape of the component that
  applies it (as a component value does). Links need
  nothing of the language: the router handles a click on any `<a href>`.
- **MO-11g (JS calls inside a factory's arguments) — proposed
  2026-11-18, revised 2026-11-21.** A call to a JS fn declared `forwards`
  (a row word after the signature) among a factory's argument literals, or
  a carrying call's (MO-11o), hands its arguments on to it: the components
  in them are values there too (MO-11c), found through the call's own
  record and array literals. This is `@solidjs/router`'s `defineRoute({
  path, component })`, an identity at run time whose type gives the
  component its params from its path (MO-8d): `export pure fn
  defineRoute(…): RouteDefinition forwards`. A JS call without the word may
  keep or render what it is given itself, so its components take the
  cautious placement (MO-11s) wherever it is written; that is the revision
  (the first draft handed every JS call's components on, which credited a
  factory's boundaries to a helper that renders elsewhere). Bound on its
  own (`route = defineRoute({ … })`), even a forwarding call is not part of
  any route table the checker can see, and its components take the
  cautious placement too.
- **MO-11h (Typed params) — proposed 2026-11-18.** A page declares the
  params it reads as a prop, `component Person(props: { params: { id:
  string } })`, as any component declares its props; the router passes
  `params` to a route's component. Whether a route's path supplies them is
  TypeScript's question, asked where the table is written: `defineRoute`'s
  type carries the path's literal type into the component's props (MO-8d),
  and `rx-tsc` refuses `defineRoute({ path: "/people", component: Person })`
  (TS2322) on that line. The checker learns nothing about path syntax. A
  child route's own type does not see its parent's path (the router's own
  limit); under a factory declared `nests(…)` and `joins(path)` (MO-11i)
  the projection writes each literal path joined with its parents' (each with each, for
  paths written as alternatives), so `defineRoute` types a child's
  component from the whole path and it sees its parents' params. Elsewhere
  a page under a parametrised parent declares them optional (`org?: string`).
- **MO-11i (Nested values) — proposed 2026-11-18.** `nests(kids in
  inside)` on a fn that hands back a `Component` says how it renders a
  record among its arguments: the component at the record's `inside` field
  renders the entries under its `kids` field among its own children. For
  `@solidjs/router`, `nests(children in component)`: a nested route renders
  in its parent's `props.children`. The checker applies that record's
  component value with the nested values as its children, as `<Layout><Page
  /></Layout>` would be, so a layout's `errored`, `loading` and `provide`
  above `props.children` reach its routes, and its content model holds them
  (SV-7d). Sibling records stay siblings. Without the word, DV-24 applies;
  on a fn that hands back no `Component` it is a parse error. The word
  describes the shape of the arguments, not a router: any library that
  nests a tree of components it is given says it the same way.
  `joins(field)` beside it (revised 2026-11-21) says the library joins a
  nested record's `field` with its parents': a router's rule, which the
  tree alone does not imply (another library can nest the same tree and
  read a field named `path` differently), so without it nothing is
  joined. In the projection (TY-1c), which is type-checked and never run, a
  record's literal `field` (`joins(path)` for `@solidjs/router`) under such
  a fn is written joined with its parents' literal ones (`/org/:org` above `/:id` gives `/org/:org/:id`;
  `/` gives the parent's), looking through records with no `path` (the
  config around the table) and JS calls (`defineRoute(…)`), so a nested
  route's component is typed with every param above it. A path written as
  alternatives (an array of literals) joins each with each. A path that is
  neither stops the joining beneath it, which errs strict: the routes
  below are typed with their own params only, so a page that needs a
  parent's param is refused, never accepted unchecked. The lowered program
  passes the paths as written.
- **MO-11j (An exported factory's component) — proposed 2026-11-18.**
  `export Router = createRouter({ … })` exports the made component. Its
  signature (MO-3) is that of a component whose view is `<Router />` in the
  making module: what the components it was given let out of it, the
  contexts they need that it does not provide (MO-12c), and their content
  shape, so `export component Router(props: {}) made fails(Error)
  uses(./theme.rx#theme) shape(roots h1)`. An importer applies it as any
  imported component, checked against that signature. The made component is
  exported as the component it is, not an accessor (CP-4b); `made` in the
  signature says it is a JS component, so an importer that has only the
  signature (MO-9) applies it as JSX's `<X />`, with no `children` prop.
- **MO-11k (Render props) — proposed 2026-11-18.** A declared JS
  component whose `children` field is typed as a function giving a `View`
  (`children: (item: T, index: number) => View`) takes a render prop: the
  library calls it for each thing it renders (a virtual list's rows). In
  `.rx` it is written as the application's only child, a view lambda:
  `<VirtualList items={rows}>{view (row, i) { … }}</VirtualList>`. Its
  parameters are values, what the library passes on each call (as a `for`
  row's binding is); its body is a reactive block, declarations then a
  view, owned where the component calls it. The checks treat the body as
  the application's children (RG-4c, MO-11b): its readers' failures and the
  contexts it uses are checked above the application, through the
  component's declared `catches(…)` and `provides(…)`, and its content model
  where the component places its children (SV-7d). Handlers in it write
  sources as any handler does. It lowers to an arrow returning the view
  (`children: (row, i) => …`) and projects to the same arrow, so TypeScript
  types the parameters from the component's own types (TY-1c). Other
  children of such a component are `VIEW_FN_EXPECTED`; a view lambda
  anywhere else is `VIEW_FN_MISPLACED`. A render prop the declaration
  marks optional (`children?: (state: ToggleState) => View`, UI SDK's
  `Toggle`) may be left out — the component then renders by
  itself — and no children at all is not `VIEW_FN_EXPECTED`
  (2026-11-22; S-module-14). A render prop under another name is
  a named view lambda among the children, `{view header (n) { … }}`: it is
  that prop (`header={(n) => …}`), checked as the children are; a name the
  declaration does not type as a function giving a `View` is
  `VIEW_FN_MISPLACED`. Executable: S-module-14.
- **MO-11l (Fns that render what they are given) — proposed 2026-11-18.**
  `renders` on a declared fn that hands back no component (`createTable(ref
  options: { columns: { cell: Component }[] }): any renders`) says it
  renders the components in its argument literals, through something the
  app calls later (`flexRender(cell.column.cell, …)` in its view). They are
  values there, found as a factory's are (MO-11c, MO-11g), and they are
  checked as applied, with no arguments, where its result is bound: among
  the children of that region, which renders the table (DV-24's
  assumption, at the binding). Their failures, contexts and first loads are
  checked above the binding. `renders` implies `instantiates`; a component
  passed to a fn with no placement word is checked under a root of its own
  (MO-11s). S-module-16.

  `renders` is a claim about the API, not the call: write it only where the
  library renders what it is given through something called in the region
  of the binding (a table whose cells the same view renders). Where the
  result can be rendered anywhere else (handed to another component,
  stored, portalled), the binding's region is not where the components
  render, and its boundaries would be credited wrongly: declare
  `renders(later)` and the consuming prop's `renders T` (MO-11o), which put
  the check where they do render, or nothing, which takes the cautious
  placement (MO-11s). (Revised 2026-11-21.)

  **The checker holds the program to it (ruled 2026-11-22).** The bound
  value, and every value that may hold a part of it (MO-10k, by mention:
  an alias, a record or an array holding it, a field read out of it, a
  row of a `for` over it, what a call given it returns, a parameter
  handed it), is read and rendered in the region it is bound in, and
  leaves it through none of the ways out:

  | way out | refused where |
  | --- | --- |
  | a component's prop — a JS component's, or an `.rx` component's that does not keep it (below) — as it is, in a spread, in a closure that returns it | the attribute |
  | a provision | the `provide` |
  | an export — the name, a fn or an action that gives it, a source seeded with it | the declaration |
  | a source: its seed, a write, a guess | the write |
  | a thrown value (it goes to whichever boundary catches it) | the `throw` |
  | an argument of a call that may keep it: an action of another module, an `.rx` fn of another module that declares state or can fail, an `io` JS fn, a method of another value, a function the checker cannot name (a prop, a parameter, a part of a record, what a call returns) | the call |

  each `RENDERS_ESCAPES`. A fn, an action or a named closure of this
  module is seen into instead: its parameter is what it is given, and its
  body is checked with that (so `action stash(x) { held := x }` is refused
  at its write when it is called with a row). A `pure` JS fn keeps nothing
  (`flexRender(cell.column.cell, …)`), nor does a method of a `pure` JS
  import, nor a method of the value that its declaration names, called on
  the value's own name (`createTable(…): … renders methods(setSorting)`,
  then `table.setSorting(next)`): the result of such a call is a part of
  the value again. *A method of the value itself* was once any call whose
  receiver mentioned the value (closed 2026-11-22): `({ onSend:
  props.onSend, t: table }).onSend(table)` is such a call and hands the
  table to the parent, and so does a callback the program itself put in
  the table (`table.options.meta.report(table)`). A receiver says nothing
  of what is called; the declaration's `methods(…)` does. A call with no
  argument that may hold a part of the value keeps nothing whatever it
  is, so `table.nextPage()` and `row.toggleSelected()` need no word. A function the checker cannot name
  is refused in reactive scope too: `props.report(table.rows)` hands the
  rows up to whatever applied the component. What is free to leave is a primitive made of it —
  `str(row.name)`, a template, arithmetic, a comparison, `len(table.rows)`
  — a part its declaration says is a primitive, and a closure that gives
  nothing back: `onPress={() => { table.nextPage() }}` is an ordinary
  prop. *A declared primitive (2026-11-22).* The declared result type
  is read a step at a time (MO-10k): with `createTable(…): { label:
  string; getPageCount: () => number; getRowModel: () => { rows: { id:
  string }[] } } renders`, `table.label`, `table.getPageCount()` and
  the `row.id` of `for row in table.getRowModel().rows` are a string and
  numbers by declaration, hold no part of the table, and are passed to a
  child or a callback as they are, with their types (`<Pager
  pages={table.getPageCount()} />`, `props.onPick(row.id)`). A part
  whose type the text does not say is a primitive's — `any`, a record,
  an array, a field the declaration leaves out — is the value's. *Guarantee:* in a program the
  checker accepts, no `.rx` code outside the region a bare `renders`
  result is bound in holds that result or a value read out of it, so
  whatever renders its components is beneath that region, under the
  boundaries and provisions they were checked under. It rests on the
  declaration (`renders` is the library's claim that it renders through
  what the app calls there) and on `pure` at the JS boundary. It is
  stricter than the earlier revisions on purpose: they let a path read
  through (`held := table.rows`, a row of `for t in [table]` given to
  whatever would take it), which carries the components as well as the
  table does. S-module-16.

  **A component that keeps what it is given (2026-11-22, after the
  review).** The table above refused every component's prop, and with
  it shadcn/ui's data table as it is written: `<DataTablePagination
  table={table} />`, a component of the app's own given the table to
  read its page count and call `nextPage()`. The guarantee does not need
  that. A component applied in the region the value is bound in is
  *beneath* that region, and so is everything it renders: boundaries
  and provisions only add on the way down, so what was checked at the
  binding holds wherever beneath it the components run. What the
  guarantee needs is that the value does not leave *that component*.
  So an `.rx` component's prop is a way out only when the component
  does not **keep** it: a component keeps a prop when no way out
  written in its body — the table's rows above: a prop of a component
  that does not keep it in turn, a provision, a source, an export, a
  thrown value, a call that may keep it — is given a value that may
  hold a part of `props.<field>`, by mention (MO-10k: an alias, a row
  of a loop over it, a parameter handed it, what a call given it
  returns), or the props whole (a spread, a rest). It is the binding
  region's own rule asked of the prop, by the same analysis; a
  component being decided is taken to keep it, so two components that
  only hand the value to each other keep it between them. Rendering it
  (`flexRender(props.table…)`), reading it, calling its methods from a
  handler, and giving it on to a component that keeps it are all it
  can do.

  The summary is in the component's signature, as MO-11o's `renders`
  and MO-10f's `takes(…)` are: `export component DataTablePagination(
  props: { table }) keeps(table)` lists the props the component names
  and keeps, a prop whose declared type is a primitive's left out (it
  holds nothing). An importer reads it there; a signature that does
  not say `keeps(…)` of a prop is one that may let it out, which is the
  reading of a hand-written `.d.rx` too. A JS component's declaration
  has no such word — what it does with a prop is its own — so a
  `renders` value is still not given to one (a library that renders a
  value it is handed says `renders(later)` and a prop that `renders`
  it, MO-11o). The diagnostic stays at the application, where the value
  is bound and the choice is, and says where in the component it
  leaves: "passed to <Pick> as table, which does not keep it: there
  (line 6) props.table is written to shown". *Guarantee, restated:* in
  a program the checker accepts, a bare `renders` result, and any
  value read out of it, is held only by code of the region it is bound
  in and of the components applied beneath that region which it was
  given to and which keep it. S-module-16 (the kept table, a callback
  that hands it up, a component that gives it on to one that provides
  it), the unit `a_prop_that_keeps_what_it_is_given_is_no_way_out`
  (every way out, in the component and in one it gives it to),
  `bench/tasks/table-pagination`.
- **MO-11n (Components a library renders under its own root) — proposed
  2026-11-19.** `renders(root)` is `renders` (MO-11l) for a library that
  mounts the components it is given with a root of its own (`render()`,
  `createRoot`): a toaster, a modal manager, a widget host. They are found
  as `renders`'s are, and checked as applied, with no arguments, under a
  fresh root at the binding, as a program's view is: no `provide`,
  `errored` or `loading` above the binding reaches them (Solid's
  `useContext` and boundaries walk owners, and that root has none of the
  app's). What they need, they provide and catch themselves; otherwise
  `CONTEXT_NOT_FOUND`, `UNHANDLED_FAILURE`, or in a client-only build
  `ASYNC_OUTSIDE_LOADING_BOUNDARY`. A library that carries some of its own
  JS contexts into that root (it reads them where it is called and provides
  them there) names them: `renders(root, toastTheme)`. Each is read at the
  call, as a hook's `uses(…)` (MO-12b), so it must be provided above the
  binding, and is provided inside the root. Only contexts the same
  declaration file declares can be named (MO-12a): a library cannot carry
  the program's contexts by name; one that forwards its whole owner says
  `renders`. `root` is the only word `renders(…)` takes. S-module-18.
- **MO-11o (Components that travel in values) — proposed 2026-11-19.** Some
  libraries take components into values and render them later, from
  elsewhere: TanStack Router's `createRoute({ component })` makes a route
  object, `rootRoute.addChildren([…])` a tree, `createRouter({ routeTree })`
  a router, and `<RouterProvider router={…}>` renders the routes'
  components. `renders(later)` (MO-11r; first drafted as `carries`) on a declared fn says its result carries the
  components in its arguments (found as a factory's are, MO-11c, MO-11g;
  it implies `instantiates`), and a value computed from a carrying value
  carries them too. `renders` on a declared JS component's prop
  (`router: renders any`) says the component renders what its value
  carries: those components are checked as applied there, among its
  children (MO-11c), so its `provides(…)` reaches them and the boundaries
  above it hold their failures. A carried component that no `renders` prop
  reaches is checked nowhere, so it is `COMPONENT_AS_VALUE` where it is
  passed. A carrying value may be exported (for its type, as
  `examples/tanstack` registers its router), but a module's signature
  says nothing of what it carries. So what a `renders` prop is given must
  be a value whose components the checker can name (ruled 2026-11-22):
  every name its expression's value may come from (MO-10k, by mention) is
  followed to the carrying calls it was bound to — through a branch, a
  call, a closure's result, a row — and a name whose value comes from
  where the checker cannot look is `RENDERS_ESCAPES` at the prop: a value
  imported from another `.rx` module or made by its fn, a parameter, a
  source, a provision. The carried components are checked in
  the module that builds them, at its own `renders` props.

  **A prop given on (2026-11-22).** A component that takes a carrying
  value as a prop and gives it on, as it is, to a prop that renders it —
  the app's own frame around the library's provider, `component
  Shell(props: { router: AnyRouter }) { <RouterProvider
  router={props.router} /> }` — renders what the prop carries. So the
  prop is itself one that renders: in the component's summary, and in
  its signature (`router: renders provides(…#router)`, MO-3), which is
  what an importer reads. The components are named where the checker can
  name them — at the application, `<Shell router={router} />`, whose
  argument is held to the rule above — and checked as applied where
  `Shell` renders the prop: under the boundaries and provisions around
  the provider inside `Shell`, then those above each application of
  `Shell` (the same continuation a component's `children` take, by
  the prop's name instead). A component that gives the prop on to
  another such component forwards in turn. It is read from what is
  written: `props.x` given, as it is, to such a prop in the component's
  own view; a prop that reaches one any other way (through a local, a
  record, a call) cannot be named and is `RENDERS_ESCAPES` as before,
  and what the frame is given must still be a value whose components the
  checker can name. S-module-22; `bench/tasks/router-provider`. *Guarantee:*
  every component an `.rx` program hands a `renders(later)` fn is checked
  as applied at each `renders` prop the program gives a value that may
  carry it, or is `COMPONENT_AS_VALUE` if it gives none; no `renders`
  prop is given a value that may carry components the check did not
  name. Without MO-11p, a route's nested components are checked as
  siblings under the provider, which errs strict (a boundary inside the
  parent's component is not credited to them). S-module-22; `examples/tanstack` runs on `@tanstack/solid-router` 2.0 (rc)
  in the Vite suite, with TanStack's registered route types checked by the
  build (a link to no route fails it, TS2820).
- **MO-11p (Carried values that nest) — proposed 2026-11-19.** A route
  tree in values says its nesting through each child's link to its parent
  (`createRoute({ getParentRoute: () => rootRoute, component: Person })`),
  and a parent's component renders its children at an outlet
  (`<Outlet />`), not at `props.children`. `nests(inside under parent)`
  beside `renders(later)` (MO-11r; first drafted as `under(parent in
  inside)`) says so: its result's `inside`
  component renders among the children of the component of the value its
  `parent` field names (a closure returning that value, or the value
  itself), which is found by the same `inside` field when it has no
  `under` of its own (the root route). `outlet` on a declared JS component
  says it renders, where it is written, the children of the component
  whose view it is in, as `{props.children}` would. So where a `renders`
  prop renders the tree, a child route's component is applied among its
  parent's component's children, and its failures and context reads take
  the parent's `errored`, `loading` and `provide` around the outlet; a
  sibling's are not credited. A parent whose view has no outlet never
  renders its children, and nothing they fail with is anyone's, as at
  run time. A parent not carried in the same tree, or a chain of parents
  that comes back to a value (a cycle), leaves the value side by side
  under the provider (MO-11o's strict default). For TanStack Router:
  `createRoute(…): any renders(later) nests(component under getParentRoute)` and
  `component Outlet(props: {}) uses(router) outlet`. S-module-23.
- **MO-11q (Compound components: a JS object's member components) —
  proposed 2026-11-19.** UI kits export a component's parts on one object
  (Ark's `<Dialog.Root>` with `<Dialog.Trigger>`, `<Dialog.Content>`;
  Motion's `<motion.div>`, which Wardic exports as `wardic`), the object
  a component itself or not. A `.d.rx`
  declares each member by its written name, `export component
  Dialog.Trigger(props: { … }) uses(dialog)`, with its own rows;
  `import { Dialog } from "./kit.js"` binds each declared member as a
  component named as written (an alias renames the head: `import { Dialog
  as D }` gives `<D.Trigger>`), and `Dialog` itself as the component it is
  declared, or else as a value. `<Dialog.Footer>` with no such member is
  `UNKNOWN_COMPONENT`. The parts read the root's context, so they are
  declared `uses(…)` and the root `provides(…)` (MO-12): a part outside
  its root is `CONTEXT_NOT_FOUND`. The compiled view applies the member
  (`<v$Dialog.Trigger>`), and the projection types it from the library's
  own types; TY-6 checks each member against the object's property (a
  declared `Dialog.Root` that the kit does not have fails the check).
  `rx-declare` drafts the members of an exported object of components,
  and running them settles their rows: a part that throws rendered alone
  but renders inside its object's root reads a context that root provides.
  A prop typed with `Component` in a union (`as?: string | Component`, a
  polymorphic `as`) takes a component value as a `Component` prop does
  (MO-11c). A tag is a component's by its capital (07 §4), so an object
  exported under a lowercase name is imported under a capital to be
  applied: `import { wardic as Motion }`, then `<Motion.div>`, declared
  `export component wardic.div(…)` (2026-11-22; `<wardic.div>` is not a
  member's tag: see `rfc-declaration-types-2026-11-22.md`, the fourth
  round). S-module-24; `examples/wardic` runs Wardic 2.0 in Chromium
  (`compiler/test/wardic.mjs`; it ran Kobalte 2.0 alpha until Kobalte
  left the benchmark, 2026-11-22).
- **MO-11r (One placement vocabulary) — proposed 2026-11-19.** Where a
  library renders the components a program gives it is said in one
  vocabulary, on the declared fn that takes them; each form replaces DV-24's
  blanket assumption with a narrower, checked one. A component passed to a
  call with none of them is checked the most cautious way (MO-11s).

  | written | the components are checked | rule |
  | --- | --- | --- |
  | (a fn handing back a `Component`) | inside the made component, where it is applied | MO-11f |
  | `renders` | where the call's result is bound | MO-11l |
  | `renders(root, ctx…)` | under a root of the library's own, with `ctx…` carried in | MO-11n |
  | `renders(later)` | where a JS component's prop declared `renders` renders the value carrying them | MO-11o |
  | `nests(children in component)` | each entry of a record's `children` field among its `component`'s children | MO-11i |
  | `nests(component under parent)` | each value's `component` among its `parent` value's component's children, at that one's `outlet` | MO-11p |

  One model covers every row (consolidated 2026-11-21 after review). A
  component a program gives a library is a *value* from the literal it is
  written in until the place the library renders it, and it is checked
  once, as applied, at that place, under the boundaries, providers and
  content model there, and nowhere else:

  1. *Where it is checked* is the row's answer in the table: the made
     component (a factory), the binding (`renders`), a fresh root with the
     carried contexts (`renders(root, …)`), or the consuming render — a JS
     component's prop that `renders` the value (`renders(later)`).
  2. *The tree* (`nests(…)`) only rearranges the values inside that place:
     a nested entry is applied among its parent's children (`… in …`) or
     at the parent component's `outlet` (`… under …`); a parent the
     checker cannot find leaves the entry a sibling at the same place,
     crediting nothing of the parent's.
  3. *Travel.* A value checked at the binding (`renders`) stays there,
     and so does everything that may hold a part of it: one that leaves
     is `RENDERS_ESCAPES` (MO-11l, MO-10k). A carried value
     (`renders(later)`) may travel freely through equations, records and
     calls within its module; each `renders` prop it reaches is a
     consuming render, checked there, as often as it is rendered, and a
     `renders` prop is given only what the checker can name the
     components of: not a value from another module, a prop, a
     parameter, a source or a provision (MO-11o).
  4. *Consumption.* A carried value no `renders` prop reaches is checked
     nowhere: `COMPONENT_AS_VALUE` where its component is written. A
     component given to a call with no row takes the cautious placement
     (MO-11s), a root of its own with nothing carried.

  On the other side, two words say where a JS component renders what it
  is given: a prop's type `renders T` (the components its value carries)
  and `outlet` (the children nested under the component whose view it is
  in, as `{props.children}` would). The tree forms combine with the
  placement forms they describe (`nests(… in …)` with a factory,
  `nests(… under …)` with `renders(later)`); either form refuses a value
  it cannot place by leaving it where its placement puts it, the strict
  default. The words first drafted for these, `carries` and `under(parent
  in component)`, are refused with the spelling that replaced them.

  They are checked by running (proposed 2026-11-20): a probe file beside
  the `.d.rx` may export `scene(lib, h)`, a small app built from the
  module's exports, instrumented, with `h.component(name)` standing for
  the program's components. `rx-verify` mounts it and reads where each
  of those rendered, through a context every recording component
  provides (so the evidence is Solid's own owner chain): what a factory
  was given inside the made component, `renders` inside the caller and
  `renders(root, …)` not, `renders(later)` inside a component whose prop
  renders it, and each `nests(…)` entry inside its parent's component —
  at an `outlet` for `nests(… under …)`. A library that renders a child
  route beside its parent is a mismatch; a row the scene does not reach
  is reported unverified. `examples/tanstack/tsr.probe.mjs` checks
  TanStack Router's rows this way. A hook that warns rather than throws
  with no provider (TanStack's `useRouter`) counts as reading its
  context, for `rx-declare`'s draft and `rx-verify`'s check alike.
- **MO-11s (The cautious placement) — proposed 2026-11-21.** A component
  given to a JS fn that says nothing of where it renders it (a declared fn
  with no factory result, `renders`, `renders(root, …)` or
  `renders(later)` row, or a JS import with no declaration at all), as a
  value among its arguments, their record and array literals and the JS
  calls among them, is no longer refused (it was `COMPONENT_AS_VALUE`
  under MO-11r): it is checked as applied under a root of its own, at the
  call, with nothing above the call credited to it: no `errored`, no
  `loading`, no `provide`. This is `renders(root)` with no contexts carried,
  and it is sound whatever the library does: a library that renders the
  component beneath the call gives it more than was assumed, never less,
  and one that renders it later, many times or never needs nothing more
  of an `.rx` component. What it costs is precision: a component that
  needs a context or a boundary from above is refused
  (`CONTEXT_NOT_FOUND`, `UNHANDLED_FAILURE`) until the declaration says
  where it renders, and the content model (SV-7d) is not checked against
  a parent it cannot know. A JS component's prop typed as something other
  than a `Component` still refuses one (MO-11c); a component carried by
  `renders(later)` that nothing renders is still `COMPONENT_AS_VALUE`
  (MO-11o), since the declaration said where and nothing did. S-module-27.
- **MO-11m (A made component's properties) — proposed 2026-11-18.** A
  factory's component may carry properties (`@solidjs/router`'s `paths`, its
  typed path builder). `Router.paths` is a value read in the module that
  made it, and may be exported (`export paths = Router.paths`); with the
  library's own types, `rx-tsc` checks a link built from it
  (`paths.people("2")`). The component itself stays a component, applied,
  never a value. A page's typed search params (`useSearchParams(paths.people)`)
  cannot take `paths` from the router's module, which imports the pages
  (MO-5); the route tree's definitions go in a module of their own, with no
  page imports, and `pathsOf(defs)` builds the typed paths from them; the
  routing module adds the components to the same definitions. S-module-17.
- **DV-24 (a component value is owned at its application) — taken by
  default 2026-11-13.** Solid lets a library render a component value
  anywhere: under any owner, any number of times, or never. MO-11c's check
  assumes it is rendered beneath the owner of the application it was passed
  to, which is what `@solidjs/router` does (every route renders inside
  `<Router />`, so an `errored` or a `provide` above `<Router />` reaches it).
  A library that renders one under a root of its own escapes the check
  (CN-3b); Solid's run-time errors stand there. The assumption also gives
  away precision: a route component is checked as a child of `<Router />`,
  not of its parent route's `props.children`, so a `provide` or an
  `errored` in a layout route is not credited to the routes it wraps. A
  layout that provides a context to its pages is refused
  (`CONTEXT_NOT_FOUND`); provide it above `<Router />`. A factory declared
  with `nests(…)` (MO-11i) gives that precision back for the records it
  describes.

### Design note: why declared components and factories, not a routing form

`@solidjs/router` 2.0 (`2.0.0-next.44`) is a route table, not markup:
`createRouter({ routes })` returns the router component, a route is an
object whose `component` is a component, and a link is a plain `<a href>`.
Three ways were weighed for using it from `.rx`.

- **(a) Declared JS components and factories (taken).** MO-11a to MO-11f.
  The router's own API is usable as it is, and so is any Solid component
  library: two declaration forms and one value rule, with no router
  semantics in the language. What the checks keep across the boundary:
  R-f-5 and RG-7b over every route as if rendered at `<Router />` (MO-11c);
  CN-3d over every route's first load, so a client-only app cannot ship a
  page that shows nothing while it loads; SV-7d where a declaration writes
  `shape(…)`; owner order on both sides is Solid's, since the router and
  the compiled components are both Solid code (CP-4a). What they lose:
  which route renders when, a layout route's boundaries and provisions
  (DV-24), and the hooks' context (MO-11d). Types are TypeScript's, from the
  router's own `.d.ts`, in `rx-tsc` (TY-1c).
- **(b) A routing form in the language** (`routes { "/people/:id" => Person }`,
  compiled onto `createRouter`). The checker would know the route tree, so
  it could credit a layout's `errored` and `provide`, type each route's
  params from its path, and check a link's target. The cost is a form whose
  meaning is one library's, a second place to follow the router's releases
  (its 2.0 API moved from `<Router>`/`<Route>` markup to a route table while
  this was written), and no help for any other component library. Most of
  what it would prove can be added to (a) later as declaration words.
- **(c) Something smaller.** Only the hooks from `.rx`, with the route table
  in TSX. That needs TSX to import an `.rx` page as a Solid component, but a
  compiled module's default export is a function of the app (CP-4a), not a
  component, and the projection's default export is drafted elsewhere (#65).
  It also checks nothing across the routes. (a) does not need it; it
  remains a separate interop question.

Executable: S-module-5 (declared components and component values, checked
only), S-module-6 (the router: a factory, hooks, route data; checked only,
against a package that ships its `.d.rx`), and `examples/router/`, built by
Vite with `@solidjs/router` 2.0.0-next.44 and driven in Chromium
(`compiler/test/vite.mjs`).

## MO-12 — JS contexts (proposed 2026-11-18; veto here)

A Solid library keeps its session state in a context (`createContext`): its
hooks read it with `useContext`, and one of its components provides it. A
hook called where nothing provides it throws at run time. MO-12 lets a
declaration say so, in the words `.rx` contexts already have (RG-7b), so that
call is refused where it is written. Nothing is added at run time.

```rx
// router.d.rx
export context router
export pure fn createRouter(config: { routes: RouteDefinition[] }): Component provides(router)
export pure fn useParams(): Params uses(router)
export pure fn useNavigate(): (to: string) => void uses(router)
export component RouterProvider(props: { children?: View }) provides(router)
```

- **MO-12a (Declared).** `export context c` in a JS module's `.d.rx` names
  a context the module's JavaScript owns. It is named only by that file's
  `uses(…)` and `provides(…)`: it is not importable, and `.rx` cannot `use`
  or `provide` it. Its key is the declaration file's (`./router.d.rx#router`,
  MO-7), so every module that imports the library names the same context.
  A `uses(…)` or `provides(…)` naming a context the file does not declare is
  `NOT_EXPORTED`.
- **MO-12b (Uses).** `uses(c)` on a fn says a call reads `c`: each call is a
  `use` of it where it is called, checked by RG-7b over the static
  application tree, through signatures across modules (MO-3: the caller's
  component carries `uses(./router.d.rx#router)`). A fn that uses a context
  instantiates (MO-10a, inferred): Solid finds a context through the owner
  a hook runs under, so it is called once, where it is bound. On a declared
  JS component, `uses(c)` is what the component itself needs from above.
- **MO-12c (Provides).** `provides(c)` on a declared JS component provides
  `c` to everything it renders: its children and every prop. On a fn that
  hands back a `Component` (MO-11f), it is the made component that provides
  it, to the components the call was given, which MO-11c checks as applied
  beneath it. On any other fn it is a parse error: nothing it renders could
  see the provision.
- **MO-12d (Provider order).** A provider that needs another above it says
  so with `uses(…)` (`export component DevtoolsProvider(props) uses(queryClient)
  provides(devtools)`): nested in the wrong order, it is `CONTEXT_NOT_FOUND`
  like any other use. Nothing new is needed.

Executable: S-module-7.

## MO-13 — Packages written in `.rx` (proposed 2026-11-22; veto here)

A library written in `.rx` is published as a package and used by two kinds
of app: an `.rx` app, which is checked against the package as it is against
a local module, and a JavaScript or TypeScript Solid 2 app, to which it is
an ordinary Solid library. One build serves both. Nothing is drafted
(`rx-declare` has no part in it) and no declaration is written by hand: the
package's `.d.rx` is the signature the compiler printed (MO-3).

```text
@demo/rates/
  package.json            exports: Solid's conditions (MO-13e)
  dist/
    index.dom.js          the module, compiled for the browser (hydratable): a factory over the app
    index.ssr.js          the module, compiled for the server
    index.js              what `browser` and `default` resolve to: `__rx`, and each export for JavaScript
    index.server.js       what `node`, `deno` and `worker` resolve to: the same over index.ssr.js
    index.d.rx            the printed signature, `//@ signature index.rx …`   ← what an .rx app is checked against
    index.rx.d.ts         the types of the module's projection (13 TY-4c)      ← what an .rx app is typed by
    index.d.ts            the types of index.js                                ← what a .tsx app is typed by
    rx-prelude.d.ts       the types the projections are written with
```

- **MO-13a (The marker).** A `.d.rx` with a line `//@ signature
  <module>.rx …` before its first row (blank lines and comments alone may
  come before it) — a pragma line, as `//@ for` (MO-8f) and `//@
  generated` (MO-8l) are — is the printed signature of a compiled `.rx`
  module. Wherever
  a JS import finds it as its declaration — beside a relative module
  (MO-8a), or by any step of MO-8k for a package — it is read as MO-9b
  reads a signature, not as MO-8a reads a JS module's declaration, and the
  import is an `.rx` import in everything but its specifier: it resolves to
  the module the signature stands for (the declaration's path with `.rx`
  for `.d.rx`: `node_modules/@demo/rates/dist/index.rx`), which is known by
  its signature only (MO-9a). The compiler writes the marker on every
  signature it prints (`ref/check.ts --signature`, `rxc app --lib`), after
  it the module's name and free text; a `.d.rx` without it means what it
  meant. For an `.rx` import that finds an `x.d.rx` in place of `x.rx`
  (MO-9a) the line is a comment: that file was always a signature.
  The grammar: a comment to both parsers of rows; `ref/src/modules.ts`
  `isPrintedSignature` and the crate's `is_printed_signature` test it
  before a declaration is parsed; tree-sitter reads a file that begins
  with it as a printed signature (`signature_pragma`, then
  `signature_export` rows), and a JS declaration otherwise.
- **MO-13b (What the marker switches).** Every way the two notations
  differ, each decided by the marker and by nothing else (S-module-33; the
  unit `a_marked_declaration_is_read_as_a_signature` in both checkers):

  | | a printed signature (marked; MO-9b) | a JS module's declaration (MO-8) |
  | --- | --- | --- |
  | `rejects(…)` absent on a fn | the fn returns nothing that rejects | `rejects(Error)` |
  | a fn's purity | `pure fn`, with `io` among its rows (`: io pending`) | `pure fn` is pure, `fn` is io |
  | `export source x … = …` / `:= …`, `export x: pending fails(E)` | a reactive name, read-only to the importer (MO-2a), with its rows; `=` a question (`refresh x`, `guess x :=`), `:=` not | no such row: a JS value is `export const x: T`, never reactive |
  | `export action f` | an action: io, it never fails (R-f-6), `ACTION_CALLED_IN_OWNED_SCOPE` where called in reactive scope | no such row |
  | `export server fn f(a)` | a server function (12 SF-1), `server pure fn` when it is not io | `server` is a side: a JS function that exists on the server only (12 SF-5) |
  | `export error C(a, b)` | an `.rx` error class with its constructor's parameters | a JS class, with the fields sent to the client (SV-5a) |
  | `export context c: T = …` | an `.rx` context: importable, `use`d and `provide`d by the importer (MO-7), with `source`, rows and whether it has a default | a context the JavaScript owns: not importable, named only by that file's `uses(…)` and `provides(…)` (MO-12a) |
  | `uses(…)`, `provides(…)`, `retains(…)` | context *keys*, relative to the signature's own module (`./theme.rx#theme`), of any module; `uses(loading)` is SV-7b's need | names of contexts the same file declares |
  | a component's props | the summary of MO-3, a row per prop: bare (rendered, discharging nothing), `catches(E)` / `catches(*)`, `provides(…)` for children, `unrendered`, `action go catches(…)`, `takes(…)`, `renders`; no types | TypeScript's fields, with the words of MO-8i on them (`handler`, `renders`, `catches`) |
  | after a component | `made`, `fails(E)`, `uses`, `retains(…)`, `keeps(…)`, `shape(roots …; closes-p; a; form; children-at …)` (SV-7d's words) | `fails(E)`, `uses`, `provides`, `outlet`, `shape(T)`, `trusted` |
  | types | none: a row's types are the projection's, in the `.d.ts` shipped beside it (MO-13d); `export type T` is a name | the row's text is the module's `.d.ts` (13 TY-4b) |
  | type parameters, several rows of one fn, optional and rest parameters, `handler`, `tracked`, `draft`, `signal`, `renders(later)`, `nests`, `joins`, `forwards`, `methods`, `const` | not written: an `.rx` module has none of them to say | MO-8d to MO-8p, MO-10, MO-11 |
  | what it is held to | nothing: the compiler inferred each row from the module (MO-3), so there is no assertion to check — no boundary check (13 TY-6), no pin (MO-8f), no strict record (MO-8j) and no `trusted` | TY-6 against the module's types; MO-8f; MO-8j |
  | the import's own rows | `import pure` cannot lower an io row and `fails` is refused, with MO-4a's messages | MO-8b |
  | what the name is bound to | the app's instance of the module (MO-1b): a source and an equation are accessors, an instantiating fn is called once where it is bound, an action is launched, a component is applied (MO-9c) | the JS module's export, as it is |
  | lines | one export per line | a row may span lines |

  A context key crosses the package boundary because it is relative: the
  signature of `dist/index.rx` says `uses(./theme.rx#theme)`, which is
  `node_modules/@demo/rates/dist/theme.rx#theme` wherever the package is
  installed — the key of the context `@demo/rates/theme` exports, whose own
  signature is `dist/theme.d.rx`. So the app provides a package's context
  with the name it imported, the package's provider component provides it
  to the app's children, and a reader with neither above it is
  `CONTEXT_NOT_FOUND` at the application, as for a local module. A package
  ships the signature of every module its entries reach, at the place the
  module has under the package's source root, so every relative key names
  a file that is there.
- **MO-13c (The compiled module).** The import stays an ES import of the
  specifier the program wrote (MO-8c), and what it imports is the module's
  factory, exported as `__rx`: `import { __rx as __m0 } from
  "@demo/rates"`, then `__rt.module(__m0, __m0)` where an `.rx` dependency
  is instantiated (MO-1b), keyed by the factory itself — a bundler gives
  one function to every importer, so the package's module is one module of
  the app however many of the app's modules import it, with its state
  owned by the app (on the server, by the request, SV-4). The bundler picks
  the browser or the server build by the package's export conditions, as it
  picks `@solidjs/web`'s.
- **MO-13d (Types).** The import is typed as an import of the `.rx` module
  the signature stands for: the projection (13 TY-1c) writes `from
  "./node_modules/@demo/rates/dist/index.rx"`, the path from the importer,
  and TypeScript finds `index.rx.d.ts` beside the signature — the
  declarations it emitted from that module's own projection when the
  package was built (13 TY-4c), so a prop, a parameter, a context's type
  and a declared error's fields are the package author's types, with their
  type parameters, and no `any` is introduced. The projection's own
  vocabulary (`View`, a context's type) is `rx-prelude.d.ts`, shipped with
  the package. `ref/` has no such file and stubs the module as `any`, as
  for MO-9.
- **MO-13e (The library build).** `rx-lib` (`@reactivescript/compiler`,
  `compiler/lib.mjs`; the crate's `rxc app --lib`, which also prints each
  module's signature) builds a package from its entries (`"reactivescript":
  { "entries": ["src/index.rx", "src/theme.rx"] }` in its package.json, or
  arguments): every module they reach is checked and compiled once for the
  browser (Solid's `dom`, hydratable) and once for the server (`ssr`), and
  written with its signature and its types in the layout above, at its
  place under the source root; the JavaScript modules the package's `.rx`
  imports by relative paths are copied beside them with their `.d.ts` and
  `.d.rx`. `rx-tsc` emits the projections' declarations, which is the
  package's type-check too. The package.json's `exports` are held to the
  layout: for an entry,

  ```json
  ".": {
    "types": "./dist/index.d.ts",
    "worker": "./dist/index.server.js",
    "browser": "./dist/index.js",
    "deno": "./dist/index.server.js",
    "node": "./dist/index.server.js",
    "default": "./dist/index.js"
  }
  ```

  the conditions by which `solid-js`, `@solidjs/web` and
  `@reactivescript/runtime` pick a build, in their order; `rx-lib` fails
  and prints the map when the package.json says anything else for an
  entry, or does not name Solid and the runtime among its peers, and
  `rx-lib --write` writes both. There is no `solid` condition: that
  condition means source for the app's own Solid compiler, and an `.rx`
  package cannot count on an app that compiles `.rx`. The `.d.rx` needs no
  condition: it is beside the file `browser` resolves to (MO-10c).
  *Why the sources are not shipped for `.rx` apps to compile.* An app that
  compiled a package's `.rx` would check it as part of its own program —
  whole, with one compiler — and could not then run beside a `.tsx` host
  that imports the same package's compiled module without two instances of
  its state. The signature is exact for every check an importer makes
  (MO-9b), so compiling again buys no check; one compiled module for both
  kinds of app is one instance. The `.rx` text is in the source maps
  (`sourcesContent`), for a debugger.
  *Hydration.* A hydration key is not in the compiled text: Solid's
  runtime numbers owners as they are made, on the server and again in the
  browser, and both builds of a module make the same owners in the same
  order (10, Implementation). So a package compiled apart from the app
  hydrates with it, provided both builds come from one compile and the app
  has one copy of Solid and of the runtime — which is why they are peers.
  `bench/tasks/rx-package` serves and hydrates both kinds of app.
- **MO-13f (The JavaScript boundary).** To JavaScript the package's module
  is a Solid 2 library (`index.js`, typed by `index.d.ts`): a component is
  a component; a source or an equation is an accessor (`rate()`); a fn is a
  function, and one that instantiates (E-9) takes each `ref` parameter as
  an accessor and hands back an accessor (`useLabel(amount)()`), as a
  Solid primitive does; an action is a function that returns a promise; an
  error class is called to make an instance, and `e instanceof C` holds. A
  context, a type and a server fn are not values of that module: a context
  is provided by the package's provider component and read by its
  components and primitives (Solid's context, through the owner), a type
  is in the `.d.ts`, and a server fn cannot be exported by a package at all
  (`rx-lib` refuses it: Solid's `"use server"` pass extracts a server fn
  from the app's own modules, 12 SF-7a, and a compiled package is not
  one). The exports are bound by the runtime's `library(factory, name)` to
  the page's app (MO-13g), and the module is instantiated there in a root
  of its own (MO-13h).
  **What stops at that boundary.** A `.tsx` caller gets TypeScript's
  checks and no others: nothing refuses a package's component rendered
  outside its provider, a read of `rate()` under no `<Loading>` or
  `<Errored>`, an action called while a component renders, a primitive
  called in a handler, an accessor read once where it should be followed.
  They fail, or misbehave, at run time as they do with any Solid library.
  The checks an `.rx` app has across the boundary are the signature's, and
  the signature is not read by TypeScript.
  **Solid 2.** The compiled modules call Solid 2.0's primitives
  (`@solidjs/web`'s compiled-template API and `@solidjs/signals`, through
  the runtime): the package's peers are `solid-js` and `@solidjs/web`
  `^2.0.0` and `@reactivescript/runtime`. It does not run on Solid 1.
- **MO-13g (One instance in a page).** MO-1b's rule holds across the
  boundary: a package's module has one instance in a page — on the server,
  in a request — whoever imports it, `.rx` modules, JavaScript, or both.
  JavaScript's use of a module (`library`, and CP-4d's `components`) is
  bound to *the page's app*, and an `.rx` program's `createApp` is that
  app:
  - *In the browser*, the page's app is the first app made in the page. A
    program's `createApp` makes it; where JavaScript used a package first
    (a `.tsx` host that renders before the program starts) the runtime
    made it, and the first `createApp` after that returns that app rather
    than a new one. Either way the program and the host read and write one
    instance, whichever came first.
  - *On the server*, inside a request (Solid's request event, as a
    framework provides it and as an app's own `stream` does) it is the
    request's app, kept in the event's `locals`: the app that streams, the
    first `createApp` called inside the event, or one the runtime makes at
    the first use — which that first `createApp` then returns. Outside a
    request it is the *render's*: one app for each call of
    `renderToString` or `renderToStream`, kept by that render's identity
    (Solid's `getHydrationWriter()`, one object for each render, found
    through the caller's owner) and gone with it. So a plain
    `renderToString(() => <App />)` works, as it does for any Solid
    library, and two renders running at once never share an instance. It
    is never the process's: an export used where nothing renders and no
    request is being answered throws, saying to use it in a render or
    inside `provideRequestEvent`. (An async function's code after an
    `await` has no owner; outside a request event that is such a place.)
  - *A request's state lives as the request does* (2026-11-22; before,
    as its first render did: a second render of the same request read
    nodes the first had disposed, in silence). A request event may see
    more than one render — a head rendered apart from the page, a
    `renderToString` inside a streamed render — and they share the
    request's app, so they read one live instance: the modules
    JavaScript instantiates in a request are under an owner the runtime
    makes for that request and no render owns (MO-13h; a `?rx-lib`
    module, CP-4d, is not yet rooted so, and is still made where it is
    first rendered). Solid's request
    event has no end to listen for, so the lifetime is counted: each
    render of the request that uses the app *holds* it until that render
    ends, and when the last hold is gone the state is released — the
    owner disposed, its modules' cleanups run — at the end of that turn
    of the event loop, so a render that follows at once takes it over. A
    use after the release is refused with an error that says so (what it
    would read is disposed); it is never given a fresh instance, which
    would be a second state for one request. A host that renders twice
    with an `await` between and nothing open meanwhile holds the request
    itself: `const release = holdRequest()` inside the event, `release()`
    when the request is answered. A request no render held (a server
    function's) is released with its event: the app is reached from the
    event's `locals` and from nowhere else, so nothing of a request is
    kept after it. Two requests never share: each event has its app.
    *Not decided here:* what a module asks is sent to the browser by the
    render in which it was first asked; a second render of the request
    reads the answer and does not send it again.
  - *A page with two apps.* A second `createApp` in one page (two programs
    mounted side by side) is a second app, with instances of its own, as
    two apps always were (MO-1b). JavaScript stays bound to the page's
    first app wherever it renders — one rule, where a rule by position
    would have a component render one app's state and its handler, which
    runs under no owner, write the other's. A host that wants another
    binding passes the app (`components(pages, app)`).
- **MO-13h (A module's root, for JavaScript).** Where JavaScript's use is
  what first instantiates a module, it is made in a root of its own
  (Solid's `createRoot`) that is not owned by the place of that use: in
  the browser by no owner, so its state lasts as long as the page — a
  root made under an owner is disposed with it, and the module's
  questions with it; on the server, in a request, under the owner the
  runtime keeps for that request (MO-13g: it lasts as the request does,
  whichever of its renders ends first), and outside a request under the
  render's root owner, so it ends with that render. The root's id is the module's
  name (`rx-lib` writes it into the call, `<package>/<module>`, in the
  letters a hydration key has, after the id of the render it is first
  used in), and its nodes'
  ids follow from it: the same on the server and in the browser wherever
  the first use is on each side, and no id is taken from the owner that
  happened to use it first. A module an `.rx` program instantiates first
  is made where the program's imports are, as before (MO-1b).
  *What this reads of Solid.* Solid 2 publishes which render the caller
  is in (`getHydrationWriter()`), and not the root owner of that render,
  nor when it ends, nor the request scope's event without a warning
  where there is none. Those three are read from Solid's own internals
  (an owner's `_parent`, `@solidjs/web`'s table of render roots and the
  `event` on a render's context, the store at `RequestContext`), in one
  module, `ref/compile/solid-internals.ts`, and nowhere else. Each read
  is checked, and what the walk finds is held against the public answer:
  a Solid shaped otherwise is refused with an error naming its version
  and what is missing. There is no fallback — a guess would give one
  render another's state. `runtime/test.mjs` asserts each of those facts
  against the installed Solid and the pinned one, so a Solid that moves
  one fails there. The public API that would replace them is proposed in
  `spec/rfc-rx-packages-2026-11-22.md`.

Executable: S-module-33 (the marker, both checkers);
`compiler/test/lib.mjs` (the build); `bench/tasks/rx-package` (a package
built and installed, an `.rx` app checked against its shipped `.d.rx` with
the verdicts it gets against the package's source, a `.tsx` app
type-checked by `tsc` against its `.d.ts`, both run in Chromium and served
and hydrated — the `.tsx` app by a plain `renderToStream` and inside a
request event; two renders at once, each with its own instance; an `.rx`
program and JavaScript sharing one, in the browser and in a stream);
`runtime/test.mjs` (MO-13g and MO-13h on the built runtime: a plain
`renderToString`, the message outside a render, a module outliving its
first reader; in one request event, two renders one after the other and
two open at once reading one live instance, its disposal when the last
has ended, the refusal after it, `holdRequest`, two requests at once,
and no event kept after its request; Solid's contract, and the refusal
of a Solid shaped otherwise). What is still a proposal is in
`spec/rfc-rx-packages-2026-11-22.md`.

---

## Diagnostics this document adds

| code | bin | rule |
| --- | --- | --- |
| `WRITE_TO_NON_SOURCE` (rule MO-2) | S | MO-2a |
| `IMPORT_ROW_MISMATCH` | S | MO-4a |
| `MODULE_CYCLE` | S | MO-5 |
| `NOT_EXPORTED`, `MODULE_NOT_FOUND` | S | MO-6a; MO-8b for a declared JS module |
| `CONTEXT_NOT_FOUND` across modules | S | MO-7, RG-7b |
| `UNKNOWN_COMPONENT` for an undeclared JS component, `COMPONENT_AS_VALUE` outside MO-11c's places | S | MO-11a, MO-11c, MO-11f |
| `CONTEXT_NOT_FOUND` for a JS hook with no provider above; `NOT_EXPORTED` for an undeclared JS context | S | MO-12b, MO-12a |
| `VIEW_FN_EXPECTED`, `VIEW_FN_MISPLACED` | S | MO-11k |
| `RESULT_AS_VALUE` | S | MO-10f: a result with held fields, used as a value |
| `DRAFT_ESCAPES` | S | MO-10i: a draft named outside its callback's own run, or handed where its parameter is not known |
| `RENDERS_ESCAPES` | S | MO-11l: a `renders` value, or what may hold a part of it, leaving its region; MO-11o: a `renders` prop given what cannot be named |

## Implementation

- MO-10: `parseDeclarations` reads `ref`, `ref T` and `instantiates` into a
  declaration's `refs` and `shape`; the checker binds a primitive as an
  instantiating fn (so E-9, E-10 and RG-6's checks are an `.rx` fn's) and
  marks each equation bound from its result a reader, an io function or a
  value. The lowering calls it once and binds a `ref` part to the accessor
  itself. A package's declaration is found by `packageDeclaration`
  (`modules.ts`, `package_declaration` in the crate). The scenarios' Solid
  library is `./prims` (`ref/src/prims.ts`: the `.rx` the interpreter runs,
  and `compile/prims-solid.ts`, the Solid primitives the other runners call).
- `ref/src/modules.ts` loads an entry and every `.rx` module it imports,
  sets each import's resolved key, orders them dependencies first, and
  reports cycles and missing modules. Scenarios declare modules in a
  `## Modules` section (fences beginning `-- module: ./x.rx`); a `file:`
  program finds its modules beside it on disk.
- `checkModules` checks each module in that order, against the signatures
  computed so far, and produces its signature. The failure check (R-f-5)
  and the provision check (RG-7b) are one pass over the static application
  tree: each step up from a reader records what it discharges — failures at
  a boundary or a catch, provisions at a `provide` — and an imported
  component's summary is one such step.
- A `.d.rx` found in place of an `.rx` import (MO-9) is parsed by
  `parseSignature` into `ModuleSet.signatures`, which `checkModules` starts
  from; such a module has no program and is not in `order`.
- MO-13: a JS import's declaration that `isPrintedSignature` (the crate's
  `is_printed_signature`) is parsed by `parseSignature` under the module's
  key and the import's `resolved` is set, so `checkModules` binds it as an
  `.rx` import (`importRx`). The lowering imports `__rx` from the import's
  own specifier and keys the module by that factory; the projection writes
  the module's path (`relativeModule`, `relative_module`). The runtime's
  `library` is `ref/compile/rt-web.ts` and `rt-server.ts`'s; the build is
  `compiler/lib.mjs`.
- The interpreter instantiates each dependency in a region of its own; the
  oracle declares it in a scope of its own inside the mounted root. The
  compiler emits `mN.mjs` per dependency — a factory over the app that
  `__rt.module` runs once — and `main.mjs` for the entry, which
  instantiates its dependencies at the start of its view.

## Decisions (all ruled; the last open ones 2026-10-26)

1. **Module state is a singleton per app** (MO-1b; ruled 2026-10-26), as module-level
   signals are in Solid.
2. **No import cycles** (MO-5; ruled 2026-10-26).
3. **`.rx` rows are the signature's** (ruled 2026-10-26): `pure` must agree and `fails` is
   refused on an `.rx` import (MO-4a).
4. **Contexts are declared** (MO-7, ruled 2026-10-23). The keyword
   `context`, and defaults allowed except on a `source` context, ruled
   2026-10-26 (07 #13). Ruled 2026-10-26 with the rest: an exported context's type is its contract, a
   module's own context infers its rows unless it writes them.
5. **The `.d.rx` notation** (ruled 2026-10-26): `catches(…)` on a prop is what the component
   discharges for it; `action catches(…)` is what an action reading it
   catches; `fails(…)` after a component is what escapes its root;
   `uses(…)` the provisions it needs.
6. **A `.d.rx` read in place, and the words it adds** (MO-9; taken by default 2026-10-26, veto
   here): an `.rx` import with no `.rx` file reads `x.d.rx`; the `.rx`
   wins when both exist (a stale `.d.rx` is not compared with it — noted:
   checking it against the computed signature, as an `.mli` is, would be a
   static check this could add). The added words are MO-9b's; `uses(…)`
   names keys by relative path (`./ui.rx#who`) where it named a bare file
   name, so that a key is exact across directories.
7. **Solid libraries are declared, not wrapped** (MO-10; taken by default
   2026-11-13, veto here). A JS `.d.rx` takes `instantiates` and `ref`, the
   words of a printed signature, and `ref T` in a return (new: `ref` in a
   type position, in JS declarations only — an `.rx` import never needs it,
   since a returned equation is its value). `instantiates` is inferred from
   `ref` and written only where neither side has one. Ryan, 2026-11-13: any
   accessor can hold (MO-10d), and the notation is `.rx`'s, with no
   `Accessor` type. A package ships its declaration beside the file its import
   resolves to, as a `.d.ts` beside its `.js` (an `"rx"` export condition was
   drafted and dropped, Ryan 2026-11-13: nothing needs it), else a local
   re-export declares it; a project-level folder of
   declarations keyed by package was the alternative, not taken.
   Built in `ref/` and the crate (S-module-4).
8. **Solid components and factories are declared, and components are values
   only to JS** (MO-11; taken by default 2026-11-13, veto here). Open for a
   maintainer:
   - (a) over a routing form (b): the design note above.
   - A JS component's fields are TypeScript types, with `catches(…)` as the
     only row word on a field. Its own failures default to none (CN-6b), not
     to `Error` as a JS fn's rejections do (MO-8a): `.rx` does not await a
     component's body.
   - A component is a value only on a `Component` prop of a JS component or
     inside a factory's argument literals; an `.rx` component cannot take
     one (it would need a form to apply a value).
   - A factory's component may be exported: MO-11j (proposed 2026-11-18)
     summarises it as a component whose view applies it, so its summary
     carries the escaping rows of the components it was given.
   - DV-24: a component value is checked as applied among the children of
     the application it reaches. MO-11i (proposed 2026-11-18) adds
     `nests(children in component)`, which credits a layout's boundaries and
     provisions to the routes nested in it.
   - The hooks' context: MO-12 (proposed 2026-11-18) adds `uses(…)` and
     `provides(…)` for JS contexts, so `useParams` outside the router is a
     compile error.
   - Typed params: MO-11g, MO-11h and MO-8d (proposed 2026-11-18) type a
     page's `props.params` from its route's path through `defineRoute`,
     with no type arguments in `.rx`. `useParams()` stays the router's
     `string | undefined`.
   - TSX importing an `.rx` module's components (#65): 11 CP-4d,
     `import { PersonCard } from "./pages.rx?rx-lib"`, typed by `rx-tsc`.
     The router under SSR is: the host gives the app its request (10 SV-4a),
     and `compiler/test/vite.mjs router-ssr` builds, serves and hydrates it.
9. **The ecosystem words, taken while prototyping** (2026-11-19; each is
   a proposal for a maintainer to rule on, recorded with why it was taken).
   The test applied to each: does it keep every check the language makes
   (no unchecked escape inside `.rx`, CN-5), and is what it lets in either
   checked statically, by TypeScript in the build (13 TY-1d), or by running
   (rx-verify)?
   - *`nests(…)`, `renders`, `renders(root, …)`, `renders(later)`* (MO-11i, l, n, o, p; one vocabulary, MO-11r)
     are kept. They describe the shape of a call's arguments and where its
     components end up, which no type says, and each replaces DV-24's
     blanket assumption with a narrower, checked one. Without them a
     library that takes components must be refused (`COMPONENT_AS_VALUE`,
     kept for every call without a word) or trusted; with them, a layout's
     boundaries reach its routes and a toaster's root gets nothing it was
     not given. No library name appears in them.
   - *Typed params in TypeScript, nested paths joined in the projection*
     (MO-11h, TY-1d) are kept. The router's own types already compute a
     path's params; restating them as rows would duplicate and drift. Since
     a production build type-checks, they are not optional. Joining a
     nested route's literal paths happens only in the projection, which is
     never run, and errs strict where a path is not a literal.
   - *`pending`/`fails(…)` on result fields, nested paths included* (MO-10f)
     are kept at field granularity. A store is read field by field, and
     only some fields wait or throw; whole-result rows would refuse its
     plain fields' reads. rx-verify reads every field under a provider and
     reports an undeclared hold or failure, which is how `isFetching`'s
     hold was found.
   - *A declared function type makes a callback* (MO-10g) is kept, with no
     word of its own: the declaration already says what the library will do
     with the argument, and `ref` already marks the parameters a library
     reads reactively (a computation, never a handler). So a value the
     library computes during the render must be declared `ref` (the program
     passes an expression, read as an accessor, MO-10a), never a function
     type; what is passed there is pure (SC-3). A wrong declaration is
     TY-6's and rx-verify's to catch, not the program's.
   - *`view (…) { … }` for render props* (MO-11k) is kept: it is markup,
     read as children, applied per call, with the parameters the library's
     own types give TypeScript.
   - *`ref={el => { … }}` as a handler* (07 §4) is kept, on an element.
     Solid runs a ref once, before mount, outside tracking; a write there
     lands as a handler's does, and a reader of the element reads the
     source. On a component, `ref` is a prop, read as its declaration says
     (MO-10g): the privilege rests on the DOM's calling convention, which a
     JS component does not promise.
   - *The request as a `createApp` option* (SV-4a) is kept: the server entry
     is the host's (an adapter, a framework), and the runtime is the one
     place every host already calls once per request.
   - *Probes beside the declaration* (`lib.probe.mjs`, rx-verify) are kept:
     they are a declaration's tests, written once by whoever writes the
     declaration, and shipped with it.
   - *A declared JS error class's identity is its declaration*
     (`people.d.rx#NotFound`, SV-5a), written by the compiler, and on the
     server the class is safe from construction: whoever serializes an
     instance first (a library's own cache) sends it as itself.
   - *`signal` parameters* (MO-10h) are kept over a general escape: a
     primitive that wraps a Solid signal gets one the compiler makes from a
     plain value, untracked, so `.rx` never holds a writable Solid signal
     and a reactive argument is refused as a snapshot would be (E-10).
   - *`renders(later)`, a prop's `renders`, `nests(… under …)` and `outlet`* (MO-11o,
     MO-11p) are kept for components held in values (TanStack Router's
     routes). Like `nests`, they say where a library renders what it is
     given, which no type says; a carried component no `renders` prop
     reaches is refused rather than trusted, and a route the words cannot
     place (no carried parent, a cycle) is checked as a sibling under the
     provider, the strict default.
   - *A JS host imports `.rx` components with `?rx-lib`* (11 CP-4d) is
     kept over `.rx` learning a framework's file-route conventions: the
     framework keeps its own (TypeScript) route files, the `.rx` module is
     checked as an entry is, and what the host passes in is typed by the
     module's projection (`rx-tsc`, the build). Module state is per request
     on the server, through Solid's request event, as in a program's own.
   - *Member components* (MO-11q) are kept, declared by their written
     name: a kit's parts are distinct components with distinct rows (each
     reads the root's context), which one object type could not say, and
     `rx-declare` settles those rows by running the parts.
   - *A library's draft* (MO-10i) is allowed, marked in the declaration,
     not in `.rx`: writing into what a library hands a callback is how its
     API writes (Solid 2's store setter), and marking it where the trust
     already sits keeps a `.rx` value from being changed behind its writes.
     Writing it uses `:=` on a path, as ST-3's own drafts do.
   - *One placement vocabulary* (MO-11r) replaces five words that answered
     one question (where does the library render what it is given?):
     `renders` says where (here, a root of its own, or later through a
     prop), `nests` says the tree (a children field, or a parent link),
     and `renders T` on a prop and `outlet` say where a JS component puts
     them. Each form is still a narrow, checked replacement for DV-24.
