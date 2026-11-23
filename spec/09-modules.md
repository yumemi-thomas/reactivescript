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
  may have a default component too; it is a component like any other:
  nothing mounts it, and it is checked where an importer applies it. (Both
  checkers walked every loaded module's default component as a mounted
  view until 2026-11-23, so a dependency whose default component relies on
  a region of its caller's was refused where no one renders it. The entry
  alone is mounted; `a_dependencys_default_component_is_mounted_by_no_one`
  on both sides.)
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
- **what a prop takes (MO-10f):** the fields of a prop that its type says
  hold or fail where they are read, so that a JS result with such fields
  may be given whole. `.d.rx`: `query: takes(data pending fails(Error))`;
- **what it stores (O-3):** each prop it stores where the stored value
  outlives the component (in a source of its module, or through a
  provision above it), passed on to a component that does included. A
  closure passed for one is checked at the application against that
  place. `.d.rx`: `retains(onPick: module, onFocus: ./form.rx#fields)`.
  (A summary said two things more until 2026-11-23, for values no
  declaration makes any more, MO-8r: `renders` on a prop given on to one
  that renders what it carries, MO-11o, and `keeps(…)`, the props whose
  value never leaves the component, MO-11l.)

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
  | a parameter | before the parameter, as in an `.rx` fn (`fn f(ref n)`) | `ref`, `...` (rest); `draft` on a parameter the fn changes in place, and on a callback's parameter |
  | a value read | before its type, as in an `.rx` row annotation (`x: pending fails(E) T`) | `ref` (an accessor), with `pending` and `fails(E)` before it where the accessor waits or fails (MO-10l); `catches(E)` on a prop; `handler` on a function type (MO-10g) |
  | what calling it, or rendering it, does | after the signature | `rejects(E)`, `instantiates`, `uses(c)`, `provides(c)`, `nests(children in component)`, `renders(H)` (MO-11u), `shape(…)`, a component's `fails(E)` |
  | a pin | a comment line | `//@ for <package> <range>` |

  A row word names the same row as the `.rx` word for it. `rejects(E)` is
  what a returned promise rejects with, `fails(E)` what a render throws:
  the two words keep the two places apart. (`pending` and `fails(E)` before
  a result's plain field were words here until 2026-11-23, MO-8r: what
  waits or throws where it is read is an accessor, and the words stand
  before its `ref`, MO-10l.)
  A member component is named as it is written (`Dialog.Trigger`, MO-11q).
  The table is what MO-8r left of it (2026-11-22): `signal`, `tracked`,
  `forwards`, `joins(field)`, `methods(m, …)`, `renders(root, c…)` and
  `trusted` were words here, and a second row of one fn's name was a
  form (MO-8p); on 2026-11-23 `pending` and `fails(E)` before a result's
  plain field, `renders` alone after a signature, `renders(later)`, a
  prop's `renders`, `nests(component under parent)` and `outlet` went too.
  On 2026-11-24 one came in, by the bar and on three libraries' evidence:
  `renders(H)`, which names a component of the same file (MO-11u). It is
  none of the forms withdrawn the day before, which stay refused by name.
  A row written
  with one of them is refused by name, with what says it now, so that it
  is never read as a type that ends in a name.
  A host declaration's view (MO-14b) writes two of these words,
  `provides(c)` and `nests(children in component)`, in the same place —
  after `export default component`, what rendering it does — and adds
  none; nor does what it renders through (MO-14f), which is an import.

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
  string literals: `"a  b"` and `"a b"` are different rows). A row nothing recorded, one
  recorded as a mismatch or as not checked, and one edited since the record
  (its hash changed) are `UNVERIFIED_ROW` (13 TY-7), each saying which and
  what to run. A project's declaration of a package (`rx-types/<spec>.d.rx`,
  MO-8k's first place) is run against the module that import resolves to
  from the folder that holds `rx-types/` (2026-11-23: `rx-verify` paired a
  declaration only with a module beside it, so no row of a project's
  declaration could be shown and strict mode could not be asked of a
  package the project declares). No word of a row opts it out (revised 2026-11-22, MO-8r:
  `trusted` after a signature did, and no declaration wrote it — strict
  mode is the project's choice, and a row a project cannot yet show is a
  reason not to make it, not a word in a library's row). A row is verified only when every claim the parser reads in it
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
  line, `}) provides(theme)`, is the row's), and a claim no check answered
  is recorded as not verified (the two words rx-verify could not run,
  `forwards` and `joins(…)`, are no longer words). A record carries the version of
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
  A generated declaration (MO-8l) is drafted the same way (draft 7: with
  MO-8o and MO-8q over the whole draft, one row an export).
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

  Every row is still held against the module before the draft is written
  (MO-8m): a row TypeScript does not hold this way is written as MO-8m
  wrote it, and one it does not hold that way either as every draft was.
- **MO-8p (A fn with several signatures) — proposed 2026-11-22,
  withdrawn the same day (MO-8r); kept as a proposal.** An export has one
  row (MO-8b). A fn the library declares with several signatures
  (TypeScript's overloads) is declared by one of them — a draft writes
  the shortest, the common form, and says how many the library has —
  and a second row of one fn's name is a parse error of the declaration,
  which says so. Nothing is lost that was read: the checker reads the
  row's words, which are a fact about the fn and not about a signature;
  an `.rx` call of a typed package is typed by the library's own
  overloads (13 TY-4b), whatever the row says; and TY-6 holds the module
  to the row, which one of its signatures fits. For a module with no
  types of its own, where the declaration is its `.d.ts`, a row takes
  the signatures together (a union, an optional parameter). S-module-31,
  the unit `an_export_has_one_row` in both checkers.

  *The proposal, as it stood.* A declaration could hold several rows of
  one name, one a signature, in the library's order; the checker read
  the first, and a later row could differ from it in types alone (another
  word on the row, on a parameter both rows have, a result of another
  shape, or any word on a parameter the first row has not was a parse
  error); the declaration's `.d.ts` wrote an overload a row and TY-6 held
  the module to each. It restated what the library's `.d.ts` says to the
  one reader who reads it there, for one library of the benchmark's
  (valibot, four fns), and brought a rule of its own to keep the rows
  from disagreeing. It comes back if a module with no types of its own
  needs overloads a union cannot write.
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
- **MO-8n (Evidence from the library's source) — proposed 2026-11-22.**
  The words of MO-8i that say what a library *does* — `handler`,
  `uses`, `provides`, `instantiates`, a result that undoes the
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
  called inside a computation (no word: a function type without `handler`
  is the pure function that must be, MO-10g); one given to
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
- **MO-8r (What earns a word) — ruled 2026-11-22.** The vocabulary of a
  JS declaration is small upstream (MO-8a to MO-8c and MO-10a to MO-10e:
  `pure fn`, `fn`, `error`, `type`, `rejects(E)`, `ref`, `instantiates`)
  and grew here, a library at a time, by twelve words of its own and a
  dozen forms (counted below). Each was taken because a library's API could then be
  written down. That is not a reason. **A word or a form is in the
  notation only if, without it, a correct Solid program that people
  commonly write cannot be written, or a mistake Solid programs really
  make cannot be refused — and that for more than one library.** The
  libraries counted are the Solid 2 ecosystem's releases — what npm has
  that accepts `solid-js ^2`, a pre-release (an alpha, a release
  candidate) as much as a stable one — and not only the ones the
  benchmark covers (ruled 2026-11-24: half of the ecosystem's Solid 2
  releases are pre-releases while Solid 2 is new, and a count that waited
  for each to be final would count the libraries that moved first last).
  What a
  single package does is said without a word, in one of the three ways
  the language already has:
  - *leave the function undeclared*: it is io and `fails(Error)` (R-io-4,
    R-f-8), a component given to it is checked under a root of its own
    (MO-11s), and TypeScript types the call from the library's `.d.ts`;
  - *a small module of the app's own JavaScript*, declared in the words
    there are (MO-10c): `export const persisted = (init, o) =>
    makePersisted(createSignal(init), o)`, `export { default as
    useOnlineStatus } from "solid-use/online-status"`;
  - *the library's own types*: an `.rx` call of a typed package is checked
    against its `.d.ts` (13 TY-4b), so nothing a row restates of a type is
    read by anyone but TY-6.

  CN-8 stands beside it: no word carries one package's rule. The review,
  with the use of each at `4368c22` over the benchmark's 26 tasks (the
  libraries whose rows write it), `examples/` and `declarations/`:

  | word or form | written by | decision | why |
  | --- | --- | --- | --- |
  | `signal` on a parameter (MO-10h) | no task; one example, one scenario | **withdrawn**: a module of the app's own | three lines of JavaScript say it; it was the only word that changed the compiled call and added to the runtime |
  | `tracked` on a function type (MO-10j) | 2 tasks, 1 library (TanStack Query) | **withdrawn**: no word | the checker read it exactly as it reads a function type with no word (pure); a word that changes no verdict is a comment |
  | `forwards` (MO-11g) | 1 task, 1 fn (`defineRoute`) | **merged into `pure`** | a `pure` fn that makes nothing keeps nothing and hands what it is given back only as its result (MO-10k): that is what the word said |
  | `joins(field)` (MO-11i) | 1 task, 1 library (`@solidjs/router`) | **withdrawn** | one router's rule for one field (CN-8c), carried into the type projection to give its types what they lack in TSX too; a nested page declares a parent's param optional |
  | `methods(m, …)` (E-10, MO-11l) | 1 task, 1 library (TanStack Router) | **withdrawn**: `peek` | a method of an instance is a call whose answer may change; where it is made once the argument says so with `peek`, the language's own word. A method given no part of a `renders` value was free already |
  | `renders(root, ctx…)` (MO-11n) | no task, no example; one scenario | **withdrawn**: no word | `renders(root)` is what a call with no word already is (MO-11s); carrying a context in waits for a library that needs it |
  | `trusted` (MO-8j) | no task, no example, no scenario | **withdrawn** | it said nothing of the library; strict mode is a project's choice, and the two claims `rx-verify` could not run (`forwards`, `joins`) are gone |
  | several rows of one fn (MO-8p) | 2 tasks, 1 library (valibot, 4 fns) | **withdrawn**: one row | the checker reads the first row's words and no type; TypeScript types the call from the library's overloads. The form restated them for no reader, and needed a rule to keep the rows from disagreeing |
  | `handler` on a function type (MO-10g) | 7 tasks: 4 libraries and 3 modules of an app's own | kept | without it a closure given to a library cannot write a source: every `onSuccess`, every listener |
  | `draft` on a callback's parameter (MO-10i) | Solid's own store (`declarations/solid-js`), 2 tasks | kept | `setStore(d => { d.done := true })` is how a Solid 2 store is written; no module of JavaScript can stand in for it |
  | `draft` on a fn's parameter (MO-10i) | 1 task (a helper of the app's own) | kept | the same word read the other way; without it `setStore(s => { arrayMove(s.items, a, b) })`, as Solid's documentation writes it, changes a copy and says nothing |
  | `pending`, `fails(E)` on a result's field (MO-10f) | 2 tasks, 1 library (TanStack Query) | kept, then **withdrawn** 2026-11-23 (*Settled*, below) | kept as `.rx`'s own row words in a new place, for Solid 2's own shape (an async store); no second library hands out a store whose plain fields wait, and Solid's own declaration does not write them |
  | `uses(c)`, `provides(c)`, `export context c` for JS (MO-12) | 6 tasks, 5 libraries | kept | a hook outside its provider, a part outside its root: refused in six tasks, in the words `.rx` contexts already have |
  | `export component`, a member's name, a render prop's type (MO-11a, k, q) | 8 tasks, 6 libraries | kept | a component library cannot be used otherwise (`UNKNOWN_COMPONENT`) |
  | `catches(E)` on a JS component's prop, `fails(E)` and `shape(…)` after one (MO-11a) | no task | kept | upstream's words in upstream's place, a component's row (MO-3, MO-9b): refusing them in a JS component's row would make that row differ from a printed one and take no word out |
  | a fn that hands back a `Component` (MO-11f) | 1 task (`@solidjs/router`) | kept: no word | the result's type says it |
  | `renders` (MO-11l) | 1 task (a table) | kept, then **withdrawn** 2026-11-23 (*Settled*, below) | kept because three libraries ask where what they are given is rendered, each in the one form its API has; the form is one library's. (The question came back with a form three libraries share, `renders(H)`: MO-11u, 2026-11-24) |
  | `renders(later)`, `renders T` on a prop (MO-11o) | 1 task, 1 library (TanStack Router); its example | kept, then **withdrawn** 2026-11-23 (*Settled*, below) | the same question for components that travel in values; kept because without it no page of a code-based route tree may read the router's context. A factory of the app's own gives the tree the words `@solidjs/router`'s has |
  | `nests(kids in inside)` (MO-11i) | 2 tasks, 2 libraries (`@solidjs/router` natively; TanStack Router through the app's own factory, since 2026-11-23) | kept | a boundary or a provider in a layout, around its pages, is how every routed app is written, and without `nests` it must be hoisted above the router, where a failure takes the navigation with it |
  | `nests(inside under parent)`, `outlet` (MO-11p) | 1 task, 1 library (TanStack Router: the second form of `nests`, and its other half) | kept, then **withdrawn** 2026-11-23 (*Settled*, below) | they place what `renders(later)` carries, and go with it |
  | `instantiates` inferred from more (a `uses`, a field row, a setter that hands a draft, a `renders`) | — | kept | no word: fewer are written |
  | `export const` (MO-8g) | 3 tasks, 3 libraries | kept | with a declaration, an export it does not name is `NOT_EXPORTED`: a value needs a row |
  | type parameters on a fn, a type, a component (MO-8d) | 12 tasks | kept | TypeScript's text, read by no checker; for a module with no types of its own the row is its `.d.ts`, and a generic helper would be `any` |
  | optional and rest parameters (MO-8e, MO-8h) | 4 tasks, and Solid's own declaration | kept | the same |
  | `readonly` before a field or a prop (MO-10b, MO-11a) | 1 task; every row of Wardic's whole draft | kept | a modifier of TypeScript's, part of no name; a draft is written as the library declares |
  | props as the library's type, `P & { … }` (MO-8o) | 5 tasks, 4 libraries | kept | it is the third way above, in a row: the props are the library's, and only the fields that carry a word are written again |
  | `//@ for <package> <range>`, `//@ generated`, `//@ signature` | every declared package; MO-8l; MO-13 | kept | comment lines, no part of a row: a pin, and what kind of file this is |
  | `made`, `takes(…)`, `retains(…)`, and since 2026-11-24 `hosts(…)` and a module's `renders … from …` row (MO-11u); until 2026-11-23 `keeps(…)` and `renders` on an `.rx` prop | printed signatures only | kept | never written by hand: what a body proved, so that a module read by its signature gets the verdicts its source gets (MO-9b) |
  | confined values (MO-10k) | — | kept | rules, not words; `methods(…)` was their one word |

  *The size of it.* Upstream, a JS row has seven words (`pure`, `fn`,
  `error`, `type`, `rejects`, `ref`, `instantiates`, with `server` and
  `client` before `fn`). This branch gave eight words of upstream's
  printed signatures a place in a JS row (`component`, `context`,
  `uses`, `provides`, `catches`, `fails`, `shape`, `pending`) and added
  twelve of its own: `const`, `handler`, `tracked`, `draft`, `signal`,
  `renders`, `nests`, `joins`, `forwards`, `outlet`, `methods`,
  `trusted`. Four of the twelve were left on 2026-11-23 — `const`,
  `handler`, `draft`, `nests` — and one form of grammar fewer (a row a
  signature): `renders` went in all four of its forms and `outlet` with it
  (*Settled*, below), and `nests` keeps the one form two routers write.
  A fifth is back since 2026-11-24, in a form it never had: `renders(H)`,
  the name of a component, which three libraries write (below).
  `const`, `handler`, `draft` and `nests(children in component)` are each
  written in more than one library. Of upstream's words in a JS row,
  `pending` and `fails` have one place more than a component's row: before
  a `ref` part of a result, an accessor that waits or fails (MO-10l,
  2026-11-23), which three libraries' rows write.

  *What no word says, and stays so* (the gaps
  `rfc-declaration-types-2026-11-22.md` lists after three libraries the
  vocabulary had not met): a module's default export (a line of the app's
  own JavaScript, `export { default as x } from "pkg"`); one function
  that reads and writes (two functions over it, in the same way); a
  callback the library calls once while the call is made (unmarked it is
  pure, which is safe; what must do io there is JavaScript's to write); a
  family of member components (a row a member the app uses); an element
  in a prop that is not `children` (a render prop where the library has
  one, a component of the app's own JavaScript where it has not);
  `children` that is a view or a function of state (the row narrows it to
  the one the app writes, MO-8o); a library's object with accessor parts,
  or a method that instantiates (an opaque value typed by TypeScript, and
  a function of the app's own for the part that must be an accessor);
  tagged templates (an `.rx` template is the same value). None of them
  stops a correct program from being written, and each is one or two
  libraries'. The one that comes nearest the bar is the element in a
  prop — every kit has an `icon` — and it is a form of `.rx`'s markup,
  not a word of a declaration: it is taken up when a second library of
  the benchmark needs it.

  *Held against the rest of four libraries (2026-11-23).* The bar was
  applied again to 190 more modules — every `@solid-primitives` package
  on Solid 2, every module of `solid-use`, each family of Wardic and of
  UI SDK — each drafted whole and used by a program
  (`bench/coverage/`; `rfc-declaration-types-2026-11-22.md`, *A fifth
  round*). No word was added. Thirty of the 120 programs have a module of
  the app's own beside them, for shapes that stay without a row: a
  function a primitive hands back that the view calls (a translator's
  `t`: given as a field of a record, which is a read, where a function
  bound by a name is io, MO-10b); one function that is two things by how
  it is called (an atom, a sensor that is also a ref); a class the app
  constructs; a component that is a part of a result; `ref` on a rest
  parameter; an accessor of a promise. The element in a prop is
  **accepted**: a second library of the benchmark has it
  (solid-primitives' `fallback` on five components, beside solid-use's
  `ClientOnly`), and the form chosen is not grammar — a component of the
  app's that takes no props, given by name to a prop typed `View`, as
  MO-11c gives one to a prop typed `Component` (MO-11t, 2026-11-23).
  Three forms were kept there on one library's evidence each; they are
  settled next.

  *Settled (2026-11-23).* The bar counts libraries, and "removing it
  breaks a good program of one library" or "loses the benchmark's
  catches in one library" is one library. Applied to the three:

  | form | the evidence, looked for again | decision | what is written instead | what is given up |
  | --- | --- | --- | --- | --- |
  | `pending`, `fails(E)` before a declared result's field (MO-10f) | none of the 190 modules of the coverage suite nor a library of the tasks hands out a store whose plain fields wait or throw, but TanStack Query; `declarations/solid-js` does not write it (an `.rx` program asks with `await`, not `createStore(fn)`) | **withdrawn**: refused by name | the store behind a module of the app's own that hands each field out as a function, declared `ref` (`data: () => q.data`, MO-10c): to `.rx` what waits where it is read is an accessor, and an accessor asks for no region (MO-10d) — as every other library's waiting value already was | the `loading` and `errored` regions the checker asked for above a query's `data`, and the result read a field at a time: five of the benchmark's bad variants, each listed in `bench/README.md` |
  | `renders` alone after a fn (MO-11l) | no module of the four libraries is given components and renders them where its value is bound; the one writer was a table, through an adapter of the app's own | **withdrawn**: refused by name | no word: each component the fn is given is checked under a root of its own (MO-11s), and takes what it needs as its props (a table's cell is given its context); the result is a plain value | a cell that reads the app's context cannot be written; the table kept in state or handed up is no longer a mistake to refuse: three bad variants |
  | `renders(later)`, a prop's `renders T` (MO-11o), and with them `nests(component under parent)` and `outlet` (MO-11p) | the second library claimed on 2026-11-23, UI SDK's `toast()`, `confirm()` and `<OverlayHost>`, was declared and used (`bench/coverage/ui-sdk/overlays`): `toast()` is given a message and answers an id, `confirm()` a title and a promise; nothing they are given is a component, nothing they answer is given to the host, and the three rows are the draft's with no word. One library, TanStack Router's code-based route tree | **withdrawn**: each refused by name | a route tree that carries components is given to a factory (MO-11f): a fn of the app's own JavaScript that takes the tree as records and hands back the component that renders it, declared `Component provides(router) nests(children in component)` — the form `@solidjs/router` has natively, which has two routers behind it now. A layout renders its pages as `props.children` (the module passes the library's `<Outlet />` there). With no word, a component given to the library's own `createRoute` is checked under a root of its own (MO-11s) | the registered route types of a tree written in `.rx` (a link to no route, a `from` that is no route: two type probes of `bench/tasks/router-provider`), and a route tree built and never rendered (it was `COMPONENT_AS_VALUE` through the carried components); `RENDERS_ESCAPES` is no diagnostic any more |

  *Since (2026-11-23, MO-14).* A route tree built in JavaScript around
  `.rx` pages is no longer credited nothing: a host declaration states what
  the host renders, in the factory's own words, and the registered route
  types come back with the checks (`bench/tasks/router-provider` is a
  file-routed app again, and its two type probes given up here are back).
  The factory stays what a tree written in `.rx` is given to. And a
  layout that renders the router's `<Outlet />` is credited by the host
  declaration's import of that component (MO-14f), with no word on the
  component: `outlet` stays withdrawn. The paragraph below is the
  reasoning as it stood.

  *Why a factory, and not a route module in JavaScript.* The other way the
  bar leaves is to build the tree in JavaScript, in a module that imports
  the `.rx` pages (11 CP-4d; `bench/tasks/start-route` does, with a
  file-based tree). It keeps the registered route types, and gives up
  what the checker is for: nothing above a page a JS host applies is
  credited, so a layout's boundary no longer holds its pages' failures and
  a hook outside the provider is no longer refused. The factory keeps
  every check the withdrawn words gave (`router-provider`'s variants are
  refused as they were, but the one that needed the carried components),
  with words two libraries write. So the tasks and `examples/tanstack` (now
  `examples/tanstack-factory`) are
  written with it. The types it loses are TanStack's own registration,
  which wants the router's value to name its type (`typeof router`): a
  tree made inside a module has none to name.

  *What the withdrawal took out* (2026-11-23): both declaration parsers
  refuse the four words by name; both checkers lose the carried-value
  walk (`renders(later)` results followed by mention to the prop that
  renders them, MO-11o; the parent links and the outlet, MO-11p) and
  `RENDERS_ESCAPES`; a printed signature no longer says `renders` on a
  prop; `rx-verify` checks a factory's placement and
  `nests(children in component)` and nothing else; `known.js` drafts
  TanStack Router's context, hooks and provider and no placement word;
  the tree-sitter grammar reads `nests(… in …)` alone.

  What the three leave in the checkers. The rule for a prop whose
  type says which of its fields wait or fail (`props: { query: { data:
  pending fails(Error) T } }`, MO-10f's "wherever a type is declared",
  with `RESULT_AS_VALUE` and a printed signature's `takes(…)`) is
  `.rx`'s own row annotation at a prop and stays, with S-module-11's last
  three programs; a declaration reaches it again through a result's `ref`
  parts (MO-10l, S-module-36). The "rendered where it is bound" half of
  MO-10k (a `renders` value kept in its region, the sinks a value may
  leave through, `keeps(…)` in a printed signature) was reached by no
  source once `renders` alone was withdrawn, and is deleted with the
  third: the checkers confine by mention one kind of value now, the
  instance a primitive made (E-10, E-5a).

  *`renders(H)`, taken (MO-11u, 2026-11-24).* The withdrawals above left
  one question with no answer in a row: a component given to a fn in one
  place and rendered by another component of the library, later. With no
  word it is checked under a root of its own (MO-11s), which refuses the
  correct program — a toast that reads the app's theme, a page that calls
  the router's hook — and the three ways out do not apply: an undeclared
  function is read the same way, the library's types say nothing of
  owners, and a module of the app's own cannot give the component a
  different owner than the library does. The bar was applied to programs
  built and run against what npm has (2026-11-24; the probes are
  `bench/tasks/kobalte-toast`, `bench/coverage/solid-sonner/toaster`,
  `bench/tasks/router-code-routes`):

  | library (its release) | the fn that is given a component | the component that renders it | run |
  | --- | --- | --- | --- |
  | `@kobalte/core` 2.0.0-alpha.5 | `toaster.show(Component)` | `<Toast.List>` | the toast's `useContext` finds what is provided above the list, and the region's own context; `<Toast>` rendered alone throws |
  | `solid-sonner` 1.0.0 | `toast(Component)` | `<Toaster>` | the component's `useContext` finds what is provided above `<Toaster>`; with the provision beside it, it finds none |
  | `@tanstack/solid-router` 2.0.0-rc.11 | `createRoute({ component })`, `createRootRoute({ component })` | `<RouterProvider>` | a page's `useParams` and the app's context above the provider are found; a page applied beside it throws |

  Three libraries, by three authors, each with the same shape and each
  refused before. So the word is in, in the one form the three share: it
  names the component. What it is not: `renders` alone ("where the result
  is bound": one library), `renders(later)` with a prop's `renders T`
  (which followed a value by mention to the prop that rendered it, and
  needed `RENDERS_ESCAPES` to hold the program to it: one library),
  `nests(component under parent)` and `outlet` (a tree's nesting: one
  library), `renders(root, ctx…)` (none). Those stay withdrawn, each
  refused by name. `renders(H)` follows no value and confines none: the
  place is a component, found where the program applies it, in whichever
  module. It carries no package's rule (08 CN-8): the checker reads the
  name of a declared component and nothing of what the library is.
  TanStack Router writes it for a tree whose pages are then checked side
  by side beneath the provider; the nesting of a tree stays with a
  factory's `nests(children in component)` and a host declaration.
  Counted: five of the twelve words this branch added are in a JS row
  now — `const`, `handler`, `draft`, `nests`, `renders` — each in one
  form, each written by more than one library.

  *An accessor that waits or fails (MO-10l, 2026-11-23).* The proposal
  the sixth round recorded — `pending` and `fails(E)` before a `ref`
  part — is taken. It meets the bar the withdrawn field words did not:
  the mistake (a value that waits or throws, read with no region above
  it) is the one `.rx` exists to refuse, no module of the app's own can
  give an accessor a row, and the rows of three libraries write it —
  solid-use's `fetch(…).json()`, solid-primitives' `createSSE`,
  `createGeolocationWatcher`, `createGeolocation` and
  `createGraphQLClient`, TanStack Query's `data` through the app's own
  hook. (`createStream`, named with them on 2026-11-23, is a plain signal
  in its 1.0.0: it neither waits nor throws, and its row says nothing.)
  It revises no ruling: MO-10d says no declaration can say an accessor
  *never* holds, and none can; this one says an accessor *does*.

  *Two gaps decided (2026-11-23), both by the count.* An element in a
  record given to a *fn* (`createPagination({ prevContent })`, and
  `@solid-primitives/i18n`'s `t("key", { clickHere: <a>…</a> })`) is one
  library's — two packages of solid-primitives, no module of the other
  three — so it gets no form: a string stands there, or a component of
  the app's own JavaScript. A table cell that reads the app's context,
  lost with `renders` alone, is one library's too (a headless table,
  through an adapter of the app's own; no module of the four libraries
  is given components and renders them where its value is bound): a
  cell takes what it needs as its props, which is what a table's cell
  context is for. Neither stops a correct program from being written.


  *A wrapper names the library's context (MO-12e, 2026-11-23).* The
  second way cost one check: a module of the app's own around a library's
  hook could not say `uses(…)` of the library's context, so the hook
  outside its provider was no longer refused. The word that says it is
  the one a hook has; what was missing is the name. `export context c
  from "<module>"` in the wrapper's declaration is the context that
  module's declaration declares, under that declaration's key. It is the
  context row with JavaScript's `from`, no new word, and three modules of
  the benchmark write it over three libraries (TanStack Query in two
  tasks, Wardic's sensor). S-module-35.

- **MO-8s (What a module of the app's own takes from the library it
  stands over) — 2026-11-24.** The ways round above — a hook's store
  handed out field by field, a method of an object handed out as a
  function, the router's provider in a component of the app's — are each
  a small JS module the app writes, and until now each came with a
  declaration written by hand: every word of it, though the module says
  nothing the library's own rows do not. `rx-declare` now reads the
  module's own text and carries those words over, in the shapes where
  they hold for every run:

  | the module writes | its row takes |
  | --- | --- |
  | `export { Toast }` of a library's component (or `export { Toast } from …`, or under another name), with its members | that row's `uses(…)` and `provides(…)`, member for member |
  | a component whose body is one `return` of one library component and nothing around it (`return <RouterProvider router={router} />`), or of a fragment around that one element alone | that component's `uses(…)` and `provides(…)` |
  | `export const Router = createRouter(…)`, of a fn whose row hands back a `Component` with words | the component's words (`provides(router)`) |
  | a fn that calls a library's hook at the top of its body — not behind a condition, not in a nested function | the hook's `uses(…)`; and `pure`, where the hook is `pure` and the body does nothing else but return a record of functions and names |
  | a fn that calls, at the top of its body, a helper of the module's own (a function declared once at the module's top, not exported) that calls the hook so | what the helper's call takes: `uses(…)`, and `pure` only where neither body does anything else |
  | a field of that record that only reads the hook's result, `data: () => q.data` | `ref` (an accessor, read as a value); and `pending fails(E)` where rx-declare knows the result's field to wait or throw |
  | a fn that hands its own parameters straight to a library call known to render them (`toast => toaster.show(toast)`) | `renders(H)`, where the module exports H too |

  The library's rows are the project's declaration of the package where
  it has one (found as the checker finds it), else what `known.js` says
  of the installed release; two facts no row of the library's own can
  say are kept there for this (`wraps`): that `@tanstack/solid-query`'s
  `useQuery` is pure, reads the client, and has a `data` that waits and
  throws (a store's field: MO-8r), and that Kobalte's `toaster.show`
  renders beneath `Toast.List`. A context a carried word names is
  declared with it — `export context router from "@solidjs/router"`
  (MO-12e) where the project declares the package, the bare name
  otherwise. The TODO a word answers is removed; any other stays. The
  draft says, in a comment, which rows took what and from where.

  **It adds no word and no form**: the rows are the ones a person wrote.
  And it is not the guess RFC 26 forbids: `pure` is still never read off
  a name. A word is copied from the row it was written on, only where
  the text shows the module does what that row describes and nothing
  more — a component that renders the provider inside markup of its own
  (an element is something of its own; a fragment is not, and one with
  the children beside the provider puts them outside it), a hook called
  behind a condition, here or in a helper, a body that also logs, take
  nothing (or `uses` without `pure`), and their questions stay. (The
  fragment and the helper were added 2026-11-24, having been listed as
  the two ways a module does the same thing and took nothing.) As any row, a
  carried one is `rx-verify`'s to run. `--types-only` leaves them out.
  What it cut, measured on the benchmark's own modules: `query.d.rx` in
  two tasks 20 words each to none, the routers' `router.d.rx` 6 and 13 to
  none and 6 (what is left is `paths`, a function with a member for each
  route, kept as a value), the Kobalte toaster's 21 to none
  (`tooling/rx-language-server/src/declare-own.js`, `test/declare.js`).

  With it, one reading of a row more (MO-8q): an accessor's options
  record where the fn has type parameters of its own (`ref options: {
  queryKey: QueryKey; queryFn: () => Promise<TData> }`) is written with
  those parameters by name, where it was said by its place
  (`ReturnType<Parameters<typeof f<TData>>[0]>`); TypeScript holds the
  reading, or the row is the one it was.

- **MO-8t (A method of a declared value) — accepted 2026-11-25 (MO-8r).**
  `export fn toaster.show(toast: Component<…>): number renders(Toast.List)`,
  written beside `export const toaster: …` — or beside `export fn
  toast(…)`, for a function that has methods of its own (`export fn
  toast.success(message: string): number`). It is a fn's row, word for
  word: `fn` or `pure fn`, `server`/`client`, `ref`, `draft` and
  `handler` on its parameters, `rejects(E)`, `instantiates`, `uses(c)`,
  `renders(H)`. **No word is added**: the form is a fn's row whose name
  takes one step from a value the same file declares.
  - *What it is to the checker.* The call `toaster.show(x)` is a call of
    the declared fn `toaster.show`, and everything a declared fn's call
    is: io or pure where it is written (R-io-3, 02 SC-4), its callbacks
    (MO-10g), a draft given to it (MO-10i), the components it is given
    (MO-11s, MO-11u), what it rejects with (R-f-8), a disposer it hands
    back (EF-5a). Nothing is a rule of its own. The module's loader names
    each mention by its row — the member `toaster.show` (written with
    `.`, not `?.`) becomes the name `toaster.show` — once, as the module
    is read, so the two checkers, the two emitters and the projection
    read one tree; a compiled call is the method called on its object
    (`toaster.show(…)`, `this` kept), and TypeScript types it from the
    library's own declaration.
  - *The object's name is the import's alone.* A module that binds the
    name again — a parameter, a local, a loop's variable, a declaration
    in a nested block — would have the methods' rows read off something
    else: `SHADOWED_IMPORT`, by the name as written (MO-1d refuses a
    declaration that shadows an import; this is the same refusal for
    every binder, and only for an import whose methods have rows).
  - *One step.* `fn a.b.c(…)` is refused: an object's own methods, not a
    path into a library. A row whose object the file does not declare a
    `const` or a `fn` is refused, and so is a second row for one method
    (an export has one row, MO-8b; a method too).
  - *A method with no row* is read as far as the declarations say, with
    two readings that were missing (each found on the way, each a
    mistake accepted in silence until 2026-11-25):
    1. **A declared value's type is read as a declared result's is**
       (MO-10b's evidence, "wherever a type is declared"): `export const
       client: { invalidate(key: string): void }` — `client.invalidate()`
       answers nothing and is io; one that answers a promise starts
       work; one that answers a value is a read. A `const`'s methods
       were never io, whatever its type said. And **a method written as
       a method** (`navigate(to: string): Promise<void>`, the form
       TypeScript prints for an interface's) is the field it is: it was
       read as a field named `navigate(to` and told nothing, for a
       declared result, a component's props and a context's type alike.
    2. **A method of an io import is io**: an import with no declaration
       is io (R-io-4), a declared `fn` is io, and so is what is called on
       it — `notify.success("saved")` in a view was accepted, where
       `notify("saved")` was `IO_IN_REACTIVE`. A `pure` import's method
       is pure; a declared value's is read by its type.
  - *Why a row, when a type is read.* The type says what a method
    answers, not what it does: `toaster.show(…)` answers the toast's id,
    `toast.success(…)` too, `query.delete(key)` a boolean,
    `overlays.mount(…)` a string — each is io and answers a value, which
    by its type alone is a read. And no type says where a component
    given to a method is rendered, that a callback is called later, or
    what a promise rejects with. Those are a fn's words, and the method
    is a fn.

  *The bar (MO-8r), applied (2026-11-25).* The narrow form — a method
  row for `renders(H)` alone — was put to it on 2026-11-24 and not
  taken: of the two libraries named, the word was true of one. The form
  judged here is the row itself, with every word a fn has, and the
  count is of the libraries whose API is an object's methods. Surveyed
  with TypeScript's checker over every package of the benchmark's
  workspace (each export whose type has function-typed members of the
  library's own, classes and components aside), then run:

  | library (its release) | the export | methods, and what each answers | run on Solid 2.0.2's development build, the method called while a view computes |
  | --- | --- | --- | --- |
  | `@kobalte/core` 2.0.0-alpha.5 (`/toast`) | `toaster`, an object | `show` → the toast's id, given a component; `update`, `promise`; `dismiss`, `clear` | throws Solid's `REACTIVE_WRITE_IN_OWNED_SCOPE` |
  | `solid-sonner` 1.0.0 | `toast`, a function | `success`, `error`, `info`, `warning`, `message`, `loading`, `custom` → an id; `promise`; `dismiss`; `getToasts`, `getHistory` | no error: one more toast each time the computation runs (three after two changes) |
  | `@ui-sdk/solid` 0.1.0-beta.13 | `toast`, a function; `overlays`; `shortcuts` | `toast.success`… → a string; `overlays.mount` → a string; `shortcuts.register` → a disposer | no error: one more toast each time |
  | `@solidjs/router` 2.0.1 | `query`, a function | `get`; `set`, `clear` → nothing; `delete` → a boolean | no error: the cache cleared on every computation |
  | `@solid-primitives/storage` 5.0.0 | `cookieStorage`, an object | `getItem`; `setItem`, `removeItem` → nothing | (not run) |
  | `@tanstack/solid-query` 6.0.0-rc.6 | `focusManager`, `onlineManager`, `notifyManager`, `timeoutManager` | `setFocused`, `setOnline` → nothing; `subscribe` → a disposer | (not run) |

  Six libraries by five authors export such an object; four were run.
  *Necessary*, on both counts of the bar. A mistake Solid programs make
  could not be refused: a toast shown, a cache cleared, while a view
  computes — both checkers accepted each of the four, declared or not,
  and in three of them nothing at run time says so either. And a
  correct program could not be written: a component given to
  `toaster.show` was `COMPONENT_AS_VALUE`, with no row to say where it
  renders. The way out the bar names — a module of the app's own that
  hands the method out as a function — is what every app then wrote
  (`bench/tasks/kobalte-toast` had one, three lines and a declaration),
  and it is not what the libraries' documentation writes: the shim
  existed for the notation, not for the program. It is gone from the
  benchmark. *More than one library*: six.
  It carries no package's rule (08 CN-8): the checker reads a fn's row.
  `solid-sonner`'s `toast.custom(fn)` keeps no `renders(…)`: it calls
  `fn` with no owner at all (MO-11s), and its row says `fn` and nothing
  more — true of it, and enough to refuse it in a view.

  *What it does not reach.* A method of a value the *program* makes —
  `router.navigate(…)`, a query client's `invalidateQueries(…)`, a
  table's `nextPage()`, `Route.useLoaderData()` — is no export, and has
  no row: it is read by its declared type (the first reading above,
  which a method written as a method now has). One that is io and
  answers a value (`queryClient.setQueryData(…)`) is therefore read as
  a value still, as MO-10b has ruled since 2026-11-22; a row for a
  result's method would be a second form (a name is not enough to say
  which result), asked of no program here, and is not taken.

  `rx-declare` drafts a row for each method of an exported object or
  function that the library's own types declare (not what every
  function, array or string has), after its object's row, io as drafted
  — a draft never guesses `pure`, and asks where the name reads as one
  (`get…`, `is…`, `has…`). `known.js` says `renders(Toast.List)` of
  Kobalte's `toaster.show`. `rx-verify` runs a method's row as a fn's,
  called on its object. The projection to a `.d.ts` (TY-4b) writes a
  value's methods into its type and a fn's into the namespace TypeScript
  merges with it; TY-6 holds each row to the library's member.
  Executable: S-module-42; the unit
  `a_method_of_a_declared_value_has_a_row_of_its_own` in both; the
  tree-sitter corpus's *a method of a value the file declares*;
  `bench/tasks/kobalte-toast` (the library's own `toaster`, twelve
  variants), `bench/coverage/solid-sonner/toaster`,
  `bench/coverage/ui-sdk/overlays`, `bench/tasks/router-data`.

- **MO-8u (A module's default export) — 2026-11-25.** A JavaScript
  module's default export is the export named `default`, and its row is
  named so: `export pure fn default(): ref boolean`, `export component
  default(props: MarkdownProps & { … })`. An `.rx` module imports it as
  JavaScript does, under a name of its own — `import { default as
  useOnlineStatus } from "solid-use/online-status"`, `import { default as
  Markdown } from "solid-marked/component"` — and that name is the one
  the program calls, applies (a component by its capital, 07 §4) and is
  told of in a diagnostic. **Nothing was added, to the notation or to
  either implementation**: a row is named by its export (MO-8a), `default`
  is a name both declaration parsers read, and the import form is the one
  an alias has always had. What was missing was the draft, and the
  sentence: `rx-declare` wrote a default export as a note to hand it out
  by name from a JS module of the app's own (`export { default as x }
  from …`), and so every program that used such a library had one —
  seven of the coverage suite's thirty modules of the app's own gave "a
  default export" as a reason. It drafts the row now (a component by what
  it is: a default export has no capital to go by). Three modules that
  did nothing else are gone from the benchmark
  (`bench/coverage/solid-marked/markdown`, `solid-use/online-status`,
  `solid-use/page-visibility`), and `bench/tasks/solid-use-primitives`
  imports two utilities directly; the four that remain have a reason of
  their own. Executable: S-module-43; `tooling/rx-language-server`'s
  `test/declare.js`.

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
    chains;
  - MO-11u's two rows, for the components a fn declared `renders(H)` is
    given: on a component, `hosts(./kit.d.rx#Toaster catches(E)
    provides(./theme.rx#theme); …)`, one entry for each place it applies H
    (what is discharged and provided above H's children there); and of
    the module, `export hosts(…)` for the places it roots itself and
    `export renders ./kit.d.rx#Toaster from toast:12 fails(E) uses(…)
    hosts(…)` for each call that was given components (the fn, its line,
    what the components let out, and the places they apply a host
    themselves). H is named by its declaration's path, relative
    to the module, as a context is.
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
  *An owner of its own (2026-11-23).* The call is made in an owner of its
  own under the place it is written (RG-6a's nested region, made at run
  time: `__rt.inst`, Solid's `createOwner`), and outside tracking. To the
  place it is written the primitive is then one child, on the server and
  in the browser, whatever it makes inside. Before, what it made was the
  component's own: a library whose server path makes fewer effects than
  its browser path — `if (isServer) return () => true`, before the
  `onSettled` the browser's path runs — took one hydration id more in the
  browser than on the server, and every element written after it was
  looked for under a key the server had not written (`Hydration key miss`,
  the page detached). Sixteen of the first twenty-five packages of
  solid-primitives the coverage suite met do that
  (`createConnectivitySignal`, `createIsMounted`, `createActiveElement`,
  `createPageVisibility`, …), in a `.tsx` app as in an `.rx` one; with the
  owner, each of them hydrates here. The call is untracked because it is
  made once (E-9): what a library reads of a `ref` argument while it is
  being made (`const initial = access(ref)`) is a read it means to make
  once, and Solid's development build reports it against the component
  (`STRICT_READ_UNTRACKED`) — in `.rx` an element ref is a source, so
  `createFullscreen(el)` passes a signal where a `.tsx` author passes
  `() => el`. And a `ref` argument written out as a constant (a literal,
  or an array, a record or a template of literals) is the plain accessor
  `() => "a.mp3"`, not an equation (RG-6b): there is nothing to follow, a
  node for it took an id for no reader, and reading it was a read of a
  reactive value. Cleanups registered in the call are that owner's, and
  the owner is the region's: none runs while the region lives; when the
  region goes they run, the primitives' (the last made first) before the
  region's own; and a region that is made again (a branch, a row) takes
  the primitive it made with it, once. A failure is the caller's: an
  error thrown while the primitive is made is thrown where the call is
  written, to the `errored` region the caller is under, and one thrown
  later by what the primitive made (a memo of its own) reaches the same
  region — the owner is under the caller's, so Solid's search for a
  boundary passes through it. `runtime/test.mjs` holds each on both
  builds (one id of the component's, whatever the call makes; the order
  of cleanups; both failures), `compiler/test/confined.mjs` through a
  compiled program in Chromium (a cleanup under a branch that closes, a
  failing primitive under `errored`), and `ref/crate.ts --lower` that
  both emitters write the same call;
  `bench/tasks/primitives-sensors` serves and hydrates three such
  packages; the coverage suite (`bench/coverage/`) the rest.
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
  No declaration can say an accessor never holds. One may say that an
  accessor does wait, or fail, where it is read: `pending` and `fails(…)`
  before its `ref` (MO-10l), and then the checker asks for the regions a
  question's reader needs. A plain `ref` asks for none.
- **MO-10e (What stays the library's).** A call to a foreign setter is not a
  write of a source: O-4 and AC-1 see only `.rx` sources. So a read of `isOn`
  after `setOn(v)` in the same action reads the value before the write, under
  Solid's batching, and AC-1d cannot say so; the guide teaches it. A plain
  closure passed as a callback option is unchecked, as O-4a's is.
- **MO-10f (Fields that hold or fail) — proposed 2026-11-18; withdrawn
  from declarations 2026-11-23 (MO-8r, *Settled*).** A declared result's
  field no longer takes `pending` or `fails(…)`: both parsers refuse them
  by name, with what says it now (a module of the app's own that hands
  the field out as a function, declared `pending fails(E) ref`: MO-10c,
  MO-10l). What
  follows is the rule as it was, kept because its second half — a type
  that says which fields hold, read a field at a time — is still how an
  `.rx` component's prop typed that way is read (`props: { query: { data:
  pending fails(Error) T } }`; S-module-11). *As it was:* A field of
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
- **MO-10l (Accessors that wait or fail) — accepted 2026-11-23 (MO-8r).**
  A `ref` part of a declared result may say what a read of it does:
  `pending` and `fails(…)` before the `ref`, `.rx`'s own row words in the
  place a row annotation has them (CN-4a).

  ```rx
  export pure fn createJson(url: string): pending fails(Error) ref User                               // the whole result
  export pure fn createGeolocation(): [pending fails(Error) ref Coordinates, () => void]             // an item of its tuple
  export pure fn useQuery(ref o: Options): { data: pending fails(Error) ref T; isFetching: ref boolean; refetch: () => void }   // a field of its record
  ```

  A reader bound from such a part is checked as a question's reader is
  (ST-5): it carries `pending` — `pending?`, `latest` and `loading` apply
  as for any `ref` (MO-10d), and in a client-only build CN-3d asks for a
  `loading` region above its reads — and it can fail with the named
  classes, so each read needs a `catch` or an `errored` region above it
  (R-f-5). The rows travel as a question's do: an equation over the
  reader has them, a prop given it is read where the child reads it, an
  export's signature carries them (MO-3). Either word may stand alone
  (`pending ref T` for an accessor whose failures go elsewhere).
  - *Where.* Before a `ref` part and nowhere else, and a part is where
    MO-10b reads one: the whole result, an item of a tuple result, a
    field of a record result, one level. Before anything else in a result
    — a plain field (MO-10f, withdrawn), a type below the first level, a
    function type's own result — the words are refused by name, with what
    to write. A parameter takes neither.
  - *The result is read a part at a time.* A record or a tuple with such
    a part is MO-10f's result with held fields, by the same rule and for
    the same reason: its name stands only where a part is read from it,
    where an equation gives it another name, or where it is compared or
    tested, so that every read of the part is one the checker sees
    (`RESULT_AS_VALUE` otherwise: passed, stored, returned, spread,
    exported whole). The part itself is a reader, and goes anywhere a
    value goes. A result that is itself the accessor has nothing to keep
    whole.
  - *What it does not say.* A plain `ref` asks for nothing, as before
    (MO-10d): the word is for the accessors that are known to wait — an
    async memo, a resource, a first event — not a claim owed of every
    one. A declaration may say less than the library does (13 TY-6b); it
    may not say `pending` of what is no accessor.
  - *Why a word, when MO-8r withdrew the field's.* The withdrawn form was
    one library's shape, a store whose plain fields wait. The mistake is
    not one library's: reading a value that waits or throws with no
    region above it is what `await`'s rows exist to refuse, an accessor
    is how every Solid library hands such a value out, and no module of
    the app's own can give an accessor a row. Counted on 2026-11-23:
    solid-use's `fetch(…).json()` (an async memo), solid-primitives'
    `createSSE` (`data` throws Solid's `NotReadyError` until the first
    message, then the stream's error), `createGeolocationWatcher`
    (`location`, until the first fix), `createGeolocation` and
    `createGraphQLClient` (through a memo of the app's own), and TanStack
    Query's `data` through the app's own hook (MO-10f's fallback). Their
    programs wrote `loading` and `errored` because their authors knew to.
  - *Where the rows come from.* The types cannot show it (an accessor
    that waits is an `Accessor<T>`): `rx-declare` writes the words for a
    release whose source they were read off (`known.js`, by version
    range: `createSSE`, `createGeolocationWatcher`), and `--run` writes
    `pending` for a hook it could run whose accessor's first read is not
    ready; `fails(…)` a run with no arguments does not show, and a person
    adds it. `rx-verify` reads each part in an effect: a `ref` part that
    waited and does not say so is pointed out (no mismatch: the row says
    less), a plain field that waits or fails is a mismatch, and a part
    declared `fails(C)` is run with the probe's failing arguments.

  Nothing changes at run time: the read is the same call. Executable:
  S-module-36; the units `an_accessor_that_waits_or_fails_says_so_before_ref`,
  `a_word_no_longer_in_the_vocabulary_is_refused`; `bench/tasks/query-forward`
  and `query-mutation` (five variants), `bench/coverage/` `solid-use/fetch`,
  `primitives/sse`, `graphql`, `geolocation` (two variants each).
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
  it not a read); a function type without the word is
  pure, so `onCompare: (v: number) => number` takes no write
  although its name begins with `on`. The name's reading (SC-4) is kept for
  a prop the declaration does not type as a function (`onPick: any`) or
  does not name, for `.rx` components, and for elements. `ref` is a handler
  on an element (07 §4), whatever it is passed; on a component it is a prop
  as any other (revised 2026-11-21 after review): the component, not the
  DOM, decides when to call it, so a declared `ref: handler (el) => void`
  is a handler, an unmarked function type is pure, and a `ref`
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
- **MO-10j (Tracked callbacks) — proposed 2026-11-20, withdrawn
  2026-11-22 (MO-8r); kept as a proposal.** Some libraries call a function
  they are given inside a computation of their own, not later as a
  handler: TanStack Query's `useQuery` runs `fetch`, and so `queryFn`, in
  the projection that computes `data`. A closure checked as a handler
  there would be wrong twice: its reads are tracked by the library, and
  Solid refuses its writes. That is what a function type without
  `handler` already is (MO-10g's revision): a pure function, so a
  statement body is `REACTIVE_WRITE_IN_OWNED_SCOPE` and an io call is
  `IO_IN_REACTIVE`, however the library calls it. `rx-verify` reports
  where an unmarked callback was called (inside a computation, or outside
  one, where `handler` would let it write).

  *The proposal, as it stood.* `tracked` before the function type
  (`queryFn: tracked () => Promise<any>`) said the library calls it inside
  a computation. The checker read it exactly as it reads no word; one
  library's rows wrote it (`@tanstack/solid-query`), and `rx-verify`
  checked it by running. A word that changes no verdict is a comment:
  it is refused by name now (left as type text it would hide the function
  type, and the prop would be read by its name instead).
- **MO-10h (Signal parameters) — proposed 2026-11-19, withdrawn
  2026-11-22 (MO-8r); kept as a proposal.** Some primitives take a Solid
  signal, a getter and a setter, and wrap it
  (`@solid-primitives/storage`'s `makePersisted`, `utils`' `wrapSetter`).
  An `.rx` source is not one, and no word of a row says "this parameter
  takes a signal". The signal is made where signals are made, in
  JavaScript, in a module of the app's own (MO-10c) that hands back what
  MO-10b already reads:

  ```js
  // storage.js
  import { createSignal } from "solid-js"
  import { makePersisted } from "@solid-primitives/storage"
  export const persisted = (init, options) => makePersisted(createSignal(init), options)
  ```

  ```rx
  // storage.d.rx
  export pure fn persisted(init: string, options?: { name?: string }): [ref string, (v: string) => void]
  ```

  `[theme, setTheme] = persisted("light", { name: "theme" })`: a reader
  and a setter called from handlers, the value read once, as an
  instantiation's arguments are (E-10). `rx-declare` drafts such a
  parameter with the library's type and a TODO that says this.
  S-module-21; `examples/primitives`.

  *The proposal, as it stood.* `signal init: T` on the declared parameter:
  the program passed the initial value and the compiler made a Solid
  signal of it (`__rt.signal(…)`; to TypeScript, Solid's own `Signal<T>`).
  It was the only word of a declaration that changed the compiled call
  and added to the runtime, for a handful of primitives, and no
  declaration of the benchmark wrote it.
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
  for each) — ruled 2026-11-22, closed the same day.** *(2026-11-23, MO-8r: two of the four kinds below are gone with
  their words — a value `renders` checked where it is bound, and the values `renders(later)` carried — and with
  them the ways out of a region, `RENDERS_ESCAPES` and a signature's `keeps(…)`. What is written of them here is the
  record of the rule as it was closed. By mention the checkers confine one kind now, the instance a primitive made;
  a result with held fields is a prop's (MO-10f) or a JS result's with a `ref` part that waits or fails (MO-10l).)*
  Four checks keep a value where the checker can see what is
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
  field the declared result type gives, or the name of a method of plain
  data (a declaration could also name a method that keeps nothing,
  `methods(m, …)`; withdrawn 2026-11-22, MO-8r: one library's rows wrote
  it, and `peek` at the call, or an argument that holds no part of the
  value, says what it said):

  | kind | its operations | the evidence | anything else |
  | --- | --- | --- | --- |
  | a result with held fields (MO-10f: a prop's; MO-10l: a JS result's `ref` parts) | read a declared field (by `.`, `[…]`, a rest that names the held ones); call a declared function field; another name by an equation; compare, test | the field is in the declared result type | `RESULT_AS_VALUE`: an inherited method (`valueOf`, `toJSON`), an undeclared field, a call through a computed key |
  | a library's draft (MO-10i) | read a path (a copy where kept); write a path; loop over a path; call a method of plain data from MO-10i's table | the method's name is an Array's, a Map's, a Set's, a string's or a number's; a function it calls is a closure written in the call | `DRAFT_ESCAPES`; what a known method answers is copied, an iterator run to its end |
  | a `renders` value (MO-11l; withdrawn 2026-11-23) | read and render it in its region; give it to a `pure` JS fn, or to a prop of an `.rx` component that keeps it; call a method of it with no part of it among the arguments; let a part out that its declared type says is a primitive | the declared result type; `pure` | `RENDERS_ESCAPES` where a call that may keep it is given it or a part of it |
  | a primitive's instance (E-10, E-5a) | name it, pass it whole | — | a read of what may change, a method's answer included: `SNAPSHOT_ARGUMENT`, `SNAPSHOT_KEPT` (`peek` in the argument says the read is once) |

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
  is a read through what may be the instance, as `clock.format()` is. What it
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
  `io` fn, a method given a part of it, a method of another
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
  no rows. It lowers to the compiled component itself. A prop typed `View`
  takes one too, applied (MO-11t).

  *A component inside a record or an array (2026-11-24).* A library's
  component is given components in a record — `solid-marked`'s `<Markdown
  builtins={{ Heading }}>`, an MDX provider's `components` — or in a
  list. A prop whose declared type *holds* a `Component` — a field of a
  record, an element of an array or a tuple, the last argument of
  `Record<…>`, `Array<…>`, `Partial<…>`, `Readonly<…>`, `Required<…>`, at
  any depth; never inside a function type — is read as a prop typed
  `Component` is, with no word: every component written in the record and
  array literals the prop is given is a value there, checked as applied,
  with no arguments, among the application's children. It was
  `COMPONENT_AS_VALUE`, and no row could say otherwise. The components are
  read in the literal, where the checker can name them; a record given to
  a prop whose type holds none is a value (`COMPONENT_AS_VALUE`). It is a form
  of the same rule, not a word, and the type is the row's own text:
  `rx-declare` writes such a prop so (`builtins: { Heading?: Component;
  … }`, after the type the library names, MO-8o). Executable: S-module-39;
  the units `a_component_inside_a_record_or_an_array_in_a_prop_is_a_value_there`;
  `bench/coverage/solid-marked/markdown`.

  *The literal by a name (2026-11-25; it was ruled a value on
  2026-11-24).* `builtins = { Heading, Paragraph }` at a module's top, or
  `tabs = [First, Second]` in a component, then `<Markdown
  builtins={builtins} />`: the program a person writes once the record
  has ten entries, or is given to two applications. It was
  `COMPONENT_AS_VALUE` on the binding, because the checker read the
  components "in the literal, where it can name them". It can name them
  through an equation as well, since an equation is never written (E-1):
  the name *is* its right side wherever it is read. So an equation whose
  right side is a record or an array literal with components in it is
  read as that literal where it is given, by name, as the whole value of
  a prop whose type holds components — each component checked as applied
  there, at every such application — on one condition, which is what
  keeps it sound: **every mention of the name in the module is such a
  prop.** A mention anywhere else (`tabs[0]`, `tabs.length`, an argument
  of a fn, another equation, a spread) could hand a component to
  something the checker does not see render it, so the components are
  values again and the binding is refused, with which of the three it
  was: read elsewhere, given to no such prop, or exported (a signature
  says nothing of the components a value holds, MO-3, so an importer
  could not be held to the condition). The mentions are counted over the
  module's whole tree by the name as written, not by what each resolves
  to, so a name bound twice (a loop's variable of the same name) counts
  against the binding and never for it; and each component must be the
  same component at the prop as at the binding. The literal is read, not
  the values an expression may take: `wide ? [First, Second] : [First]`
  is no literal, and stays a value. A factory's arguments and a fn's keep
  the literal at the call (MO-11f, MO-11s): a factory's tree is read for
  its shape (which record nests which, MO-11i), by both checkers and the
  emitter, where a prop's is read only for the components in it. No word,
  no form: the same rule, read one binding further.
  Counter-examples held as units and as the coverage entry's variants:
  `first = tabs[0]` beside the prop; `plain(tabs)` from a handler; a
  loop variable named `tabs`; `export tabs = [Plain]`; the record
  computed by a conditional.
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
  2026-11-18, revised 2026-11-21 and 2026-11-22.** A call of a JS fn that
  is `pure` and makes nothing (no `instantiates`, written or inferred),
  among a factory's argument literals or a carrying call's (MO-11o), hands
  its arguments on to it: the components in them are values there too
  (MO-11c), found through the call's own record and array literals. This
  is `@solidjs/router`'s `defineRoute({ path, component })`, an identity
  at run time whose type gives the component its params from its path
  (MO-8d): `export pure fn defineRoute(…): RouteDefinition`. It follows
  from what `pure` already says at the JS boundary (MO-10k): such a fn
  keeps nothing, and what it is given comes back only in its result,
  which is the factory's argument. An io fn, or one that instantiates,
  may keep or render what it is given itself, so its components take the
  cautious placement (MO-11s) wherever it is written. Bound on its own
  (`route = defineRoute({ … })`), even a pure call is not part of any
  route table the checker can see, and its components take the cautious
  placement too. (The first draft handed every JS call's components on,
  which credited a factory's boundaries to a helper that renders
  elsewhere; the second asked for a word of its own, `forwards`, after
  the signature. One library's one fn wrote it, and it said nothing
  `pure` had not: withdrawn 2026-11-22, MO-8r.)
- **MO-11h (Typed params) — proposed 2026-11-18.** A page declares the
  params it reads as a prop, `component Person(props: { params: { id:
  string } })`, as any component declares its props; the router passes
  `params` to a route's component. Whether a route's path supplies them is
  TypeScript's question, asked where the table is written: `defineRoute`'s
  type carries the path's literal type into the component's props (MO-8d),
  and `rx-tsc` refuses `defineRoute({ path: "/people", component: Person })`
  (TS2322) on that line. The checker learns nothing about path syntax. A
  child route's own type does not see its parent's path (the router's own
  limit, in TSX as here): a page under a parametrised parent declares
  them optional (`org?: string`). S-module-8.
- **MO-11i (Nested values) — proposed 2026-11-18.** `nests(kids in
  inside)` on a fn that hands back a `Component` says how it renders a
  record among its arguments: the component at the record's `inside` field
  renders the entries under its `kids` field among its own children. For
  `@solidjs/router`, `nests(children in component)`: a nested route renders
  in its parent's `props.children`. The checker applies that record's
  component value with the nested values as its children, as `<Layout><Page
  /></Layout>` would be, so a layout's `errored`, `loading` and `provide`
  above `props.children` reach its routes, and its content model holds them
  (SV-7d). Sibling records stay siblings. A component given children this
  way that renders none (no `{props.children}`; in a host's view, no
  component the host renders through either, MO-14f) is
  `NESTED_NOT_RENDERED`: a layout that forgot its pages, which would never
  show (it was accepted, its routes dropped from the check, until
  2026-11-23). Without the word, DV-24 applies;
  on a fn that hands back no `Component` it is a parse error. The word
  describes the shape of the arguments, not a router: any library that
  nests a tree of components it is given says it the same way. Two
  routers do (2026-11-23): `@solidjs/router` natively, and TanStack Router
  through a factory of the app's own, which writes a tree of parent links
  as records (`createAppRouter({ component: Root, children: [{ path,
  component }] })`) and passes the library's `<Outlet />` to each layout
  as its `props.children` (S-module-22, S-module-23,
  `examples/tanstack-factory`; `bench/tasks/router-provider` ran it until
  it moved to file routes, MO-14).
  *`joins(field)`, withdrawn 2026-11-22 (MO-8r); kept as a proposal.*
  Beside `nests(…)`, `joins(path)` said the library joins a nested
  record's `path` with its parents', and the projection (TY-1c), which is
  type-checked and never run, then wrote each literal path joined with
  its parents' (`/org/:org` above `/:id` gives `/org/:org/:id`; each with
  each, for paths written as alternatives), so that `defineRoute` typed a
  nested route's component with every param above it. It was a rule of
  how one router reads one field (08 CN-8c), carried into the type
  projection, to give that router's types something they do not have in
  TSX either. Without it a page under a parametrised parent declares the
  param optional (MO-11h).
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
- **MO-11l (Fns that render what they are given) — proposed 2026-11-18;
  withdrawn 2026-11-23 (MO-8r, *Settled*): `renders` alone after a
  signature is refused by name, and a fn with no word is MO-11s's. The
  rule as it was, kept for the record; its confinement (a value kept in
  the region it is bound in, `RENDERS_ESCAPES`, a signature's `keeps(…)`)
  left the checkers with MO-11o on the same day.**
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
  import: the result of such a call is a part of
  the value again. *A method of the value itself* was once any call whose
  receiver mentioned the value (closed 2026-11-22): `({ onSend:
  props.onSend, t: table }).onSend(table)` is such a call and hands the
  table to the parent, and so does a callback the program itself put in
  the table (`table.options.meta.report(table)`). A receiver says nothing
  of what is called. A call with no
  argument that may hold a part of the value keeps nothing whatever it
  is, so `table.nextPage()`, `row.toggleSelected()` and
  `table.setSorting(next)` need no word; a method given a part of the
  value (`table.setPage(table.rows)`) is refused. (A declaration could
  name a method that keeps nothing of what it is given, `methods(…)`;
  withdrawn 2026-11-22, MO-8r.) A function the checker cannot name
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
  2026-11-19, withdrawn 2026-11-22 (MO-8r); kept as a proposal.** A
  library that mounts the components it is given with a root of its own
  (`render()`, `createRoot`: a toaster, a modal manager, a widget host)
  needs no word: a fn that says nothing of where it renders what it is
  given is read exactly so (MO-11s), its components checked as applied,
  with no arguments, under a fresh root, as a program's view is — no
  `provide`, `errored` or `loading` above the call reaches them (Solid's
  `useContext` and boundaries walk owners, and that root has none of the
  app's). What they need, they provide and catch themselves; a component
  that needs the library's own context under the library's root renders
  the library's provider itself. S-module-18.

  *The proposal, as it stood.* `renders(root)` said the same in a word,
  and `renders(root, ctx…)` that the library reads its own JS contexts
  where it is called and provides them inside its root. No declaration
  outside its scenario wrote either; the first is the default, and the
  second waits for a library that needs it.
- **MO-11o (Components that travel in values) — proposed 2026-11-19;
  withdrawn 2026-11-23 (MO-8r, *Settled*): `renders(later)` after a
  signature and `renders` before a prop's type are refused by name, with
  what is written instead — the tree given to a factory (MO-11f, MO-11i).
  The rule as it was, kept as a proposal.** Some
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
  checker can name. (S-module-22 and `bench/tasks/router-provider` ran it until 2026-11-23.) *Guarantee:*
  every component an `.rx` program hands a `renders(later)` fn is checked
  as applied at each `renders` prop the program gives a value that may
  carry it, or is `COMPONENT_AS_VALUE` if it gives none; no `renders`
  prop is given a value that may carry components the check did not
  name. Without MO-11p, a route's nested components are checked as
  siblings under the provider, which errs strict (a boundary inside the
  parent's component is not credited to them). (S-module-22 held it until 2026-11-23.) `examples/tanstack` ran so on `@tanstack/solid-router` 2.0 (rc)
  in the Vite suite, with TanStack's registered route types checked by the
  build (a link to no route fails it, TS2820).
- **MO-11p (Carried values that nest) — proposed 2026-11-19; withdrawn
  2026-11-23 with MO-11o (MO-8r, *Settled*): `nests(component under
  parent)` and `outlet` are refused by name. A layout renders its pages as
  `props.children`, and a tree of parent links is written as records for a
  factory declared `nests(children in component)` (MO-11i). The rule as
  it was, kept as a proposal.** A route
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
  `component Outlet(props: {}) uses(router) outlet`. (S-module-23 held it until 2026-11-23.)
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
  `export component wardic.div(…)` (2026-11-22). `<wardic.div>` is not a
  member's tag, and it is not an element's either: no element's name has
  a `.` (a custom element's has a `-`). It was compiled, with no word
  said, as an HTML element named `wardic.div`; it is `UNKNOWN_COMPONENT`
  now, in both checkers, and the message gives the alias (`import {
  wardic as Wardic }`, `<Wardic.div>`). The rule is on the tag: a tag
  that begins with a small letter and has a `.` is refused when its head
  is a name of the module, or when it has no `-`. S-module-24; `examples/wardic` runs Wardic 2.0 in Chromium
  (`compiler/test/wardic.mjs`; it ran Kobalte 2.0 alpha until Kobalte
  left the benchmark, 2026-11-22).
- **MO-11r (One placement vocabulary) — proposed 2026-11-19; cut to what
  two libraries write, 2026-11-23 (MO-8r).** Where a library renders the
  components a program gives it is said on the declared fn that takes
  them; each form replaces DV-24's blanket assumption with a narrower,
  checked one. A component passed to a call with none of them is checked
  the most cautious way (MO-11s).

  | written | the components are checked | rule |
  | --- | --- | --- |
  | (a fn handing back a `Component`) | inside the made component, where it is applied | MO-11f |
  | `nests(children in component)` | each entry of a record's `children` field among its `component`'s children | MO-11i |
  | `renders(H)` | among the children of H, a component of the same declaration, at every place the program applies it | MO-11u |
  | (no word) | under a root of their own, with nothing above the call credited | MO-11s |

  A component a program gives a library is a *value* from the literal it
  is written in until the place the library renders it, and it is checked
  once, as applied, at that place, under the boundaries, providers and
  content model there, and nowhere else: the made component (a factory),
  each application of the component a row names (`renders(H)`), or a
  fresh root (no word). The tree (`nests(…)`) only rearranges the
  values inside a factory's place: a nested entry is applied among its
  parent's children, and a parent the checker cannot find leaves the
  entry a sibling at the same place, crediting nothing of the parent's.

  Three forms more were here until 2026-11-23 — `renders` (where the
  call's result is bound, MO-11l), `renders(later)` with a prop's
  `renders T` (where a JS component renders the value carrying them,
  MO-11o), and `nests(component under parent)` with `outlet` (MO-11p) —
  each one library's, each refused by name now with what to write. So are
  the words first drafted for two of them, `carries` and `under(parent in
  component)`.

  The rows are checked by running (proposed 2026-11-20): a probe file
  beside the `.d.rx` may export `scene(lib, h)`, a small app built from
  the module's exports, instrumented, with `h.component(name)` standing
  for the program's components. `rx-verify` mounts it and reads where
  each of those rendered, through a context every recording component
  provides (so the evidence is Solid's own owner chain): what a factory
  was given inside the made component, each `nests(…)` entry inside
  its parent's component, what a `renders(H)` fn was given beneath an
  application of H (each application in the scene is recorded), and — a
  claim of every component row with such a prop, since 2026-11-24 — what
  a prop that takes components was given beneath that application
  (MO-11c, DV-24). A library that renders a page beside its
  layout is a mismatch; a row the scene does not reach is reported
  unverified. `examples/router/router.probe.mjs` and
  `examples/tanstack-factory/tsr.probe.mjs` check the two routers' rows this way.
  A hook that warns rather than throws with no provider (TanStack's
  `useRouter`) counts as reading its context, for `rx-declare`'s draft
  and `rx-verify`'s check alike.
- **MO-11s (The cautious placement) — proposed 2026-11-21.** A component
  given to a JS fn that says nothing of where it renders it (a declared fn
  with no factory result, or a JS import with no declaration at all), as a
  value among its arguments, their record and array literals and the JS
  calls among them, is no longer refused (it was `COMPONENT_AS_VALUE`
  under MO-11r): it is checked as applied under a root of its own, at the
  call, with nothing above the call credited to it: no `errored`, no
  `loading`, no `provide`. It is the right reading of a library that
  mounts what it is given under a root of its own (a toaster, MO-11n),
  and it holds for a library that renders the component under *some*
  owner: one that renders it beneath the call gives it more than was
  assumed, never less, and one that renders it later, many times or
  never needs nothing more of an `.rx` component.

  *What it does not cover (narrowed 2026-11-24).* The claim was "sound
  whatever the library does", with a root of its own as the least a
  component could be given. In Solid 2 there is less: a component the
  library *calls with no owner at all*. Run on `solid-js` 2.0.2: in
  Solid's development build `useContext` throws there (`NoOwnerError`,
  "Context can only be accessed under a reactive root", even for a
  context with a default), and in its production build it finds nothing
  above (the default, or `ContextNotFoundError`); in both, nothing owns
  what the component makes — an effect is never disposed, and a cleanup
  it registers (`onCleanup`) never runs. Under `createRoot` the context's
  default is read and disposing the root runs both. `solid-sonner`
  1.0.0's `toast.custom(fn)` calls `fn` so (from the handler's own stack,
  outside any owner: `getOwner()` is null in it), where its `toast(fn)`
  renders the function beneath `<Toaster>`. No row describes a call with
  no owner, and the checker does not assume one: a declaration is not to
  say of such a fn that it takes a component (`toast.custom` is a member
  and has no row; a component is handed to it from the app's own
  JavaScript, under `createRoot`). `rx-verify` reports it where a scene
  shows it: a recording component rendered with no owner is a mismatch of
  the fn that was given it, with or without a placement word.

  What it costs is precision: a component that
  needs a context or a boundary from above is refused
  (`CONTEXT_NOT_FOUND`, `UNHANDLED_FAILURE`) until the declaration says
  where it renders, and the content model (SV-7d) is not checked against
  a parent it cannot know. A JS component's prop typed as something other
  than a `Component` still refuses one (MO-11c). S-module-27.
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
- **MO-11t (An element in a prop) — accepted 2026-11-23 (MO-8r).** A
  library's component takes an element in a prop that is not `children`:
  Solid's own `<Show fallback={<p>none</p>}>`, a list's `fallback`, a
  kit's `icon`. `.rx` writes markup in a view, never in an expression, so
  the element is a component of the app's given to the prop by its name,
  as MO-11c gives one to a prop typed `Component`:

  ```rx
  component Empty() {
    <li>nobody yet</li>
  }
  <Key each={people} by="id" fallback={Empty}>{view (person) { <li>{person().name}</li> }}</Key>
  ```

  *Which props.* A prop of a declared JS component whose type is `View` —
  alone, optional (`View | undefined`) or beside values (`string | View`)
  — and that is not `children` (the children are written inside the tag)
  nor a function giving a view (a render prop, MO-11k), a `Component`
  (MO-11c) or a `renders` prop (MO-11o). An undeclared prop takes no
  component; `rx-declare` drafts such a prop in the record after a props'
  type (MO-8o: it is one of the fields the checker reads something of).
  *What is given.* A name bound to a component — declared in the module,
  imported, a declared JS component, a made one (MO-11j) — written alone,
  as a tag names it. Anything else in that prop is a value, and a view
  prop still takes a value that is a view (a string). A computed
  component (`ok ? A : B`), a member (`Kit.Spinner`) and a call
  (`Empty()`) are `COMPONENT_AS_VALUE`, as anywhere.
  *What it means.* The component is applied there with no arguments:
  `fallback={Empty}` is JSX's `fallback={<Empty />}`, the element made
  where the library reads the prop (a getter in the compiled props), each
  time it reads it. It is checked as MO-11c checks a component value,
  among the application's children: under what the library's component
  provides, above what it catches, with its content model where the
  component declares a shape. A component whose props are required is
  given none, which is TypeScript's to refuse: the projection writes
  `fallback={<Empty />}` (13 TY-4b), so the error is on the name.
  *Why a name and not markup.* `fallback={<p>none</p>}` would put a view
  in an expression, which nothing else in `.rx` does (07 §4); a named
  view lambda without parameters (`{view fallback { … }}`) was the other
  candidate, and is a second spelling of a component with no props. Two
  libraries of the benchmark need the form: solid-use's `ClientOnly` and
  five components of solid-primitives (`Key`, `List`, `Range`, `Repeat`,
  `VirtualList`), each used that way now. Not covered, and decided so
  (MO-8r, 2026-11-23): an element in a record a *fn* is given
  (`createPagination({ prevContent })`), which one library asks for; a
  string stands there. Executable: S-module-34; the units
  `a_prop_typed_view_takes_a_component_by_name`; `bench/coverage/`
  `primitives/keyed`, `list`, `range`, `virtual`, `solid-use/client-only`
  (each shows its fallback's element), `bench/tasks/solid-use-primitives`.
- **MO-11u (Components a library renders beneath a component of its
  own) — accepted 2026-11-24 (MO-8r).** `renders(H)` after a declared
  fn's signature names a component H that the same `.d.rx` declares
  (`renders(Toaster)`; a member by its written name, `renders(Toast.List)`):
  every component among the fn's arguments — found as MO-11s finds them,
  through its record and array literals and the JS calls among them — is
  rendered by the library later, any number of times, *beneath an
  application of H*.

  ```rx
  // solid-sonner
  export component Toaster(props: ToasterProps)
  export fn toast(message: View | (() => View), data?: ExternalToast): string | number renders(Toaster)
  // the app's own module over Kobalte's toaster
  export fn show(toast: Component<{ toastId: number }>): number renders(Toast.List)
  // @tanstack/solid-router's code-based routes
  export pure fn createRoute(options: RouteOptions): Route renders(RouterProvider)
  ```

  *What is checked.* Each such component is checked as applied, with no
  arguments, among H's children, at **every** place the program applies
  H: what H `provides(…)` reaches it, and so does everything above that
  place — contexts, `errored` regions, `loading` regions (the server's
  hold, and in a client-only build the first load, CN-3d). H's own
  `uses(…)` is credited too: what H reads is above H, so it is above what
  H renders (Kobalte's toast reads the region's context, which the list
  reads itself). What the component lets out of all of that is the
  program's error, on the line of the call: `CONTEXT_NOT_FOUND`,
  `UNHANDLED_FAILURE`, `CLIENT_QUESTION_UNHELD` or
  `ASYNC_OUTSIDE_LOADING_BOUNDARY`, saying which fn and which component.
  Two applications of H, one with a provision above it and one without,
  refuse the program: either may render the component. The content model
  (SV-7d) is not checked against H, whose own markup the checker does not
  know.

  *No application in the program.* Nothing renders the component yet (a
  toaster not mounted, a router not yet given to its provider). It is
  then held to the least H could have above it — what H itself `uses`
  and `provides` — under a root of its own (MO-11s). So the Kobalte toast
  whose `<Toast>` reads the region's context is accepted before a list
  is written, and a toast that reads the app's theme is not.

  *Across modules.* The call may be in one module and the application of
  H in another (a `save` action in `saved.rx`, the toaster in the app's
  frame). The judgment is the program's, as a component's `uses(…)` is
  judged where it is applied: each module's signature (MO-3) carries what
  it found, and the checker of the program puts them together.
  - a call that was given components is a row of its module:
    `export renders ./sonner.d.rx#Toaster from toast:7 fails(Offline)
    uses(./theme.rx#accent, loading)` — H by its declaration's path (as a
    context is named), the fn and the line, and what the components let
    out of H's children, H's own `uses` and `provides` taken off;
  - a component that applies H says where, once for each place:
    `export component Frame(props: { … }) hosts(./sonner.d.rx#Toaster
    catches(Offline) provides(./theme.rx#accent))` — what is discharged
    and provided between H's children there and the component's root. A
    component that applies such a component in turn carries its places
    on, with what is above each application; the module's own row
    (`export hosts(…)`) is for the applications it roots itself (its
    mounted view, a root of a library's own);
  - the program's places are every module's own row, and the components a
    JS host applies (CP-4d, with nothing above them, unless a host
    declaration places them: MO-14, whose view is judged with the program
    it is the view of);
  - *a host inside a hosted component.* A component given to such a fn
    may itself apply a host: the app's `<Toaster />` in a layout that
    `createRootRoute` is given. That place is wherever the layout's own
    host renders it, so the call's row lists it, from the components'
    own root with what H uses and provides above it (`… hosts(./sonner.d.rx#Toaster
    provides(./tsr.d.rx#router))`), and the judgment composes it with
    each place of H (what is above the provider is above the layout, and
    so above the toaster), to a fixed point. With no place of H, nothing
    renders the layout, and its toaster is no place.

  A module read by its printed signature (MO-9) is therefore judged as
  its source is; `ref/run.ts` holds it for every scenario with modules.

  *What the word does to the row.* Nothing else: `toast` is `fn` (io,
  called from a handler), and its call is a call. A `pure` fn that says
  `renders(H)` is a constructor — it keeps the components it is given in
  what it makes (a route), where a `pure` fn that makes nothing keeps
  nothing (MO-11g) — so `instantiates` is inferred, as from a `uses`, and
  its result is bound once (E-9): `personRoute = createRoute({ … })`. On
  a fn that hands back a `Component` the word is refused: a factory
  renders what it is given inside the component it makes (MO-11f).

  *What it does not say.* The nesting of a tree. Every component the fn
  is given is placed beneath H side by side: a layout's own `errored`
  around its `<Outlet />` is not credited to the page the outlet renders,
  so the check errs on the strict side, and a page holds its own failure
  or the region goes above the provider. A tree whose nesting is to be
  checked is given to a factory declared `nests(children in component)`
  (MO-11i), or stated by a host declaration (MO-14). Nor does it say
  anything of a *value*: the fn's result is a value like any other, no
  value is followed to H, and nothing is confined (`RENDERS_ESCAPES` is
  no diagnostic). H is a component: a function that answers a view when
  the app calls it (`flexRender(cell, ctx)`) is not one, and a library
  whose rendering is such a function exports a component for it — as
  `@tanstack/solid-table` 9 does, `<FlexRender>` — which the row names
  (`bench/tasks/table-pagination`). `renders` alone, `renders(later)`, a
  prop's `renders T`, `nests(component under parent)`, `outlet` and
  `renders(root, ctx…)` stay refused by name (MO-8r).

  *Three things asked of it, each put to the bar (decided 2026-11-24;
  programs built and run).*
  - **A row for a method of a library's object** (`export fn
    toaster.show(…) renders(Toast.List)`; components have dotted names,
    MO-11q, fns have not: `PARSE` today). Two libraries were named for
    it, and run: under a provider, with the library's toaster mounted,
    `@kobalte/core` 2.0.0-alpha.5's `toaster.show(C)` renders `C` with
    an owner, and a context provided above the list is read;
    `solid-sonner` 1.0.0's `toast.custom(fn)` calls `fn` with no owner
    at all (`useContext` throws `NoOwnerError`), so `renders(Toaster)`
    would be false of it. One library the word would be true of, where
    the bar asks for more than one; and it is not necessary — the app
    hands the method out from a module of its own, three lines, which
    `bench/tasks/kobalte-toast` builds, runs and holds eight mistakes
    against. **Not taken.** What that module cost is gone instead: its
    declaration is drafted whole (MO-8s), no word by hand. Sonner's
    `toast.custom` is a defect of the library's, recorded and not filed.
  - **A layout's regions credited to the pages its outlet renders.**
    Built: `bench/tasks/router-code-routes` with the page's `errored`
    and `loading` regions moved into the root layout, around its
    `<Outlet />` — a correct program, refused with two errors
    (`UNHANDLED_FAILURE`, `ASYNC_OUTSIDE_LOADING_BOUNDARY`, each "no …
    above an application of `<RouterProvider>`"). To credit them the
    checker would read which route is whose child out of the values
    code-based routes are built from (`getParentRoute`, `addChildren`):
    one library's own shape, which CN-8 keeps out of the checker and
    MO-8r withdrew as a word (`nests(component under parent)`). The
    nesting has its two forms already, and each keeps the registered
    route types: a host declaration, which for a file-based tree is now
    derived from the router's own with no word by hand (MO-14g), and a
    factory declared `nests(…)`. The strict error refuses nothing wrong
    in silence, and its ways round are in the language (the region
    above the provider, or in the page). **Not taken** as a word or as
    a reading of those values — and **given by another way on
    2026-11-25**: the nesting is asked of the router object itself by
    the tool that derives a host declaration (MO-14g, *a router made in
    `.rx`*), and a page the view places is checked where it places it
    (MO-14h). The program above is accepted, with no word and no
    package's shape in a checker.
  - **An `.rx` package naming another package's host** in its
    signature: MO-13b. **Not taken** — no library writes it — and the
    silent acceptance found on the way is refused.

  *Checked by running.* `rx-verify` holds the row to a scene (MO-11r):
  every application of H in the scene is recorded, and a component the fn
  was given must render beneath one. A library that mounts it under a
  root of its own, or calls it with no owner (MO-11s), is a mismatch.
  `rx-declare` asks the question of every fn that is given a component (a
  parameter that is one, or a record that holds one) — where the library
  renders it is not in a type — and writes the word for the releases it
  was run against (`known.js`: `solid-sonner`'s `toast`,
  `@tanstack/solid-router`'s `createRoute` and `createRootRoute`;
  Kobalte's `toaster.show` is a method of an object, which no row
  declares, so an app hands it out from a module of its own, with the
  parts, and says the word there).

  Executable: S-module-22; the unit
  `renders_names_the_component_a_fns_components_render_beneath` in both;
  `bench/tasks/kobalte-toast`, `router-code-routes`, `table-pagination`;
  `bench/coverage/solid-sonner/toaster`.
- **DV-24 (a component value is owned at its application) — taken by
  default 2026-11-13.** Solid lets a library render a component value
  anywhere: under any owner, any number of times, or never. MO-11c's check
  assumes it is rendered beneath the owner of the application it was passed
  to, which is what `@solidjs/router` does (every route renders inside
  `<Router />`, so an `errored` or a `provide` above `<Router />` reaches it).
  A library that renders one under a root of its own escapes the check
  (CN-3b); Solid's run-time errors stand there. It is a claim of the
  component's row, and `rx-verify` runs it since 2026-11-24 (it was taken
  on the declaration's word, so a component that mounts what its prop is
  given later, from a handler, into a root of its own, was accepted):
  with a scene, a recording component given to such a prop must render
  beneath that application; strict declarations (MO-8j) ask for it of
  every component row with a prop that takes components. The assumption also gives
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

- **MO-12e (A context of another module) — 2026-11-23.** `export context
  c from "<module>"` in a JS module's `.d.rx` names the context `c` that
  the declaration of `<module>` declares, where MO-12a's row declares one
  of the file's own. The module is found as an import of it written in
  the declaration's own file would be (a relative module's `.d.rx` beside
  it, MO-8a; a package's by MO-8k's places), and the context's key is
  that declaration's (`rx-types/@tanstack/solid-query.d.rx#queryClient`),
  followed through a module that takes it from another in turn. So the
  file's `uses(c)` and `provides(c)` mean the library's context: a hook
  of the app's own that calls the library's hook is refused outside the
  library's provider, and a component of the app's own that renders the
  library's provider discharges the library's hooks. A name that module's
  declaration does not declare, a module with no declaration, and a
  module that is a compiled `.rx` one (its context is imported and used
  by name, MO-7) are `NOT_EXPORTED`. It adds no word: the context row,
  and JavaScript's `from`. It is what MO-8r's second way needs to keep
  MO-12b's check — a module of the app's own around a library's hook is
  how a shape with no row is used — and what a signature printed for a
  package (MO-13) still may not do, since its keys are paths
  (`rfc-rx-packages-2026-11-22.md`): this one is resolved where the
  program is checked, from the file that writes it. `rx-verify` runs the
  wrapper's `uses(…)` as it runs any (the hook with no provider must
  throw). S-module-35; the units
  `a_declaration_names_another_modules_context`;
  `bench/tasks/query-forward`, `query-mutation`,
  `bench/coverage/wardic/gestures`.

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
  | after a component | `made`, `fails(E)`, `uses`, `retains(…)`, `keeps(…)`, `shape(roots …; closes-p; a; form; children-at …)` (SV-7d's words) | `fails(E)`, `uses`, `provides`, `outlet`, `shape(T)` |
  | types | none: a row's types are the projection's, in the `.d.ts` shipped beside it (MO-13d); `export type T` is a name | the row's text is the module's `.d.ts` (13 TY-4b) |
  | type parameters, optional and rest parameters, `handler`, `draft`, `renders(later)`, `nests`, `const` | not written: an `.rx` module has none of them to say | MO-8d to MO-8o, MO-10, MO-11 |
  | what it is held to | nothing: the compiler inferred each row from the module (MO-3), so there is no assertion to check — no boundary check (13 TY-6), no pin (MO-8f) and no strict record (MO-8j) | TY-6 against the module's types; MO-8f; MO-8j |
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
  a file that is there. A key that leaves the package — one that goes
  through `node_modules`, the context of another package where it
  happened to be installed when this one was built — is refused by
  `rx-lib` (2026-11-23), with the module and the key: it is right in one
  layout of an install and wrong in the others (hoisted or not, linked,
  in a store). Such a package takes the context's value as a prop, or
  provides it from a component of its own. A key leaves the package by
  another way too, found 2026-11-24 by building one: a package's own
  declaration of another library, in `rx-types/` beside its sources. A
  package that calls `solid-sonner`'s `toast(Saved)` was built "ok" with
  `export renders ../rx-types/solid-sonner.d.rx#Toaster from toast:7` in
  its signature — a file it does not ship, and a key no application of
  the app's `<Toaster />` has, since the app declares that library itself
  under another key. In the app the package's toast was then held to
  nothing above it, in silence. `rx-lib` refuses every key (a context's,
  a host's) that names a file outside what the package ships, with the
  module and the key.

  *Naming another package's host (decided 2026-11-24: not taken).* What
  would let such a package be written is a key that names a library by
  its specifier (`solid-sonner#Toaster`) in place of a path. By MO-8r:
  no library writes it — no package of the Solid 2 ecosystem is written
  in `.rx` but this repository's own — so the count is none, where the
  bar asks for more than one; and it is not necessary: the package
  exports the component and the app shows it (`toast(Saved)` in the
  app), or the package takes the function that shows a toast as a prop.
  The refusal above is what was missing: the silent acceptance, a defect
  whatever the bar says of the form.
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
  place under the source root (a module with scoped styles has `x.css`
  beside them, which what the browser's import resolves to, `x.js`,
  imports for the app's bundler to link — 2026-11-23: it was written and
  exported, and nothing linked it; the server's entry imports none); the JavaScript modules the package's `.rx`
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
    module, CP-4d, too, since 2026-11-23: the plugin names it, and a
    named module is rooted as a package's is). Solid's request
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
  is made where the program's imports are, as before (MO-1b). A module a
  JS host imports with `?rx-lib` (11 CP-4d) is rooted the same way
  (2026-11-23): the plugin writes its name — its path from the project's
  root, the same in the browser's build and the server's — into the call
  of `components`, and onto the module for a host that calls
  `components(pages)` itself. It was instantiated where it was first
  rendered: its state died with that component, and in a request with
  two renders it was the first render's.
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

## MO-14 — What a JS host renders: a host declaration (proposed 2026-11-23; veto here)

A file-based router finds its route files itself. JavaScript — a generated
route tree, a manifest of the routes directory — imports each file's
component and renders it under the router's provider, inside the layout
its file name puts it in. No `.rx` module applies those components, so no
`.rx` module shows the checker what is above them: a component JS renders
is checked under a root of its own (11 CP-4d, MO-11s), which refuses the
program such an app is — a layout whose `errored` and `loading` regions
hold its pages, pages that call the router's hooks. A **host declaration**
says what the host does, once, in the words a factory's row already has.

- **MO-14a (The file).** `host.d.rx`, in the folder of a program's entry
  or one above it (the nearest). It is a declaration file with two kinds
  of row besides MO-8's: imports of the `.rx` components the host renders,
  written as an `.rx` module writes them — `import { Layout, Person as
  Page } from "./pages.rx"`, by name, from a relative `.rx` module (a
  module's default component by its own name: `import { Person } from
  "./routes/people/[id].rx"`) — and one view (MO-14b). It declares the
  contexts its view names as any declaration does (`export context
  router`, or MO-12e's `export context router from
  "@tanstack/solid-router"`, the library's own). An import from any other
  module — a JS module of the app's, a package — names a component of the
  host's own that it renders through (MO-14f).
- **MO-14b (The view).** `export default component provides(router)
  nests(children in component) = { component: Layout, children: [{
  component: Home }, { component: Person }] }` — where an `.rx` entry has
  `export default component App() { … }`, the app's view (MO-1c), a
  program JavaScript hosts has what the host makes of its components. The
  words are a factory's (MO-11f): `provides(c)`, the contexts it provides
  to everything it renders (MO-12c), and `nests(kids in inside)`, how a
  record's `kids` are rendered among its `inside` component's children
  (MO-11i). After `=`, the records the host renders: a record or a list
  of records, their components the names the file imports. It is written
  once in a file. **No word is added**: the form is a factory's row whose
  argument is written beside it, because the call that would give it is
  in JavaScript.
- **MO-14c (How it is checked).** As the app's view. The declaration
  stands for the entry module that would say the same in `.rx` — its
  imports, `View = f(<tree>)` for an `f` declared `Component` with the
  row's words, and `<View />` as the default component — and the checker
  walks that module with the rules it has (MO-11f, MO-11i, MO-12c): a page
  is checked among its layout's children, under the contexts the host
  provides, and what it lets out is refused there — `UNHANDLED_FAILURE`
  for a page's failure no region of its layout discharges,
  `ASYNC_OUTSIDE_LOADING_BOUNDARY` (a client-only build) for a first load
  none holds, `CONTEXT_NOT_FOUND` for a hook whose context the host does
  not provide. Such a diagnostic is the declaration's, on the line of its
  view, and names the reader's own place (`person.name at pages.rx:23 (in
  <Person>)`). The host's view is checked whenever a program under the
  declaration is: an `.rx` entry beside a JS router (its own view is
  checked as ever), a module of route components, a single route file.
- **MO-14d (What it credits, and what it does not).** A component the
  view names is rendered where the view says, and is not checked under a
  root of its own (CP-4d). Everything else stays as it was: another
  component such a module exports — one the declaration imports and leaves
  out of its view, or does not import — is rendered where no one says,
  and in a whole-program build is checked under a root of its own, as
  every export of a module a host renders (a module the declaration
  imports is such a module, whether or not the build found the JavaScript
  that imports it); a component an `.rx` module applies itself is checked
  where it applies it (a page applied by hand beside the router is outside
  it). A module the declaration imports has no mounted view: its default
  component is a route file's page, rendered by the host (MO-1c's "the
  runtime mounts it" is the entry of a program `.rx` owns). The view
  passes no props (MO-11f: each component applied with no arguments); what
  a route file's JavaScript passes is typed by the module's projection
  (CP-4d, 13 TY-1c). The view is a view of its own: what it does not name
  is not above its pages. An `.rx` entry that applies the router's
  component is named in it, with the host's records as its children
  (MO-14f); an entry the view leaves out credits its regions and
  provisions to no page.
- **MO-14e (Kept true).** The declaration is trusted as every `.d.rx` is,
  and run as every `.d.rx` is: `rx-verify host.d.rx` renders the scene its
  probe gives (`host.probe.mjs`: `scene(rx, h)`, the host's view built of a
  recording component in place of each imported one — the routes the
  route files make) and holds the view to it — each component the view
  names is rendered, inside the component of the record it is a child of
  (`placement`); for each `provides(c)`, the probe's `uses.c`, a hook
  that throws or warns with no provider, is called where each component
  renders and must do neither (`provides:c`). A page the host renders
  outside its declared layout is a mismatch. For each component imported
  from JavaScript (MO-14f) the probe gives the real one (`through.Outlet`)
  and the scene applies `rx.Outlet` where the app's component applies it:
  a component of the view must render inside it (`through:Outlet`, a claim
  of the import's own row). `rx-verify --record` records the rows as it
  records any (MO-8j), and `--rx-strict` asks for them: a host declaration
  is found by its place, not imported, and it is a declaration the program
  is checked by all the same — its pages are credited what it says — so
  `rx-tsc` in strict mode refuses the view, and each import from
  JavaScript, of every host declaration a module of the project is under
  until `rx-verify` has recorded it (`UNVERIFIED_ROW`). What the
  declaration imports from JavaScript is a declaration the program
  consumes through it, held to its pin, its record and its types as any
  other. (Until 2026-11-23 strict mode passed a host declaration over,
  because no module imports it: the reason was how the file is found, not
  what strict mode is for.) `rx-declare --host <modules…>`
  drafts the file: the imports, the contexts those modules' own imports
  are declared to use (the host must provide them), and a view with every
  component at the top; which page is among which layout's children is
  the router's own knowledge (its file names, its generated tree), and is
  left to write — or read from the router itself, which writes the whole
  file and keeps it true (MO-14g).

- **MO-14f (What the host renders through) — proposed 2026-11-23; veto
  here.** A record's children are rendered among its component's children
  (MO-11i), and an `.rx` component has two ways to say where those are:
  `{props.children}`, and a component of the host's own that it applies.
  A router's root is rendered where the app applies the router's
  component (`<AppRouter />`, `<Router />`); a TanStack layout's pages
  where the layout applies `<Outlet />`. Such a component is JavaScript,
  so the declaration says which they are, by importing them as an `.rx`
  module would: `import { AppRouter } from "./router.tsx"`, `import {
  Outlet } from "@tanstack/solid-router"` — any module that is not `.rx`,
  whose own declaration declares the name a component (else
  `NOT_EXPORTED`). **No word is added**; an import row takes a second kind
  of module.
  - *The rule.* In the host's view, a component the declaration imports
    from JavaScript, applied in the view of an `.rx` component, renders
    that component's children there — as `{props.children}` written among
    its own children would. So the records nested in a component are
    checked where it applies the host's component: under the regions and
    provisions it has around the application, and under what the applied
    component's own row provides (`export component AppRouter(props: {})
    provides(router)`, MO-12c) and requires (`Outlet … uses(router)`).
    Applied twice, they are checked at both places.
  - *An `.rx` entry around the router.* The view names the entry's
    component, with the host's records as its children:
    `export default component nests(children in component) = [{ component:
    App, children: [{ component: Root, children: [{ component: Home }] }]
    }]`. What `App` has around `<AppRouter />` — an `errored` region, a
    `provide` of the app's own — then holds every page. The router's
    context is the applied component's to provide, by its own row, not the
    view's: `App` is outside the router, and a hook in it above the
    router's component is `CONTEXT_NOT_FOUND` as before. A module the
    declaration imports is hosted (MO-14d), so the entry's default
    component is checked in the host's view, where it is at the top with
    nothing above it — what MO-1c's mount is.
  - *A component that renders none.* A component the view (or a factory's
    tree, MO-11i) gives children, which neither reads `props.children` nor
    applies a component the host renders through, is
    `NESTED_NOT_RENDERED`: its pages would never show. Before 2026-11-23
    such a record was accepted and its children dropped — a TanStack
    layout written with `<Outlet />`, the way that router's documentation
    writes one, had its pages checked under nothing at all (built: a root
    layout with every region removed, over a page that waits and rejects,
    was "ok" in both checkers).
  - *Where it is applied (revised 2026-11-25).* In the view of the
    component the record names — or in the view of an `.rx` component
    that one applies, to any depth: `Root` applies `<Frame />`, a
    component of the app's own, which applies `<Outlet />`. Until
    2026-11-25 that was `NESTED_NOT_RENDERED` on `Root` ("`Frame` takes
    the outlet as its children"), a correct program refused: a router's
    outlet renders the pages of the nearest route *above* it, which is
    the layout that applied the frame, whatever `.rx` components are in
    between. The checker reads those components, so it follows them: in
    a host's view, **an `.rx` component whose view applies a component
    the host renders through is itself one** — applied in another
    component's view, it renders that component's children where its own
    view applies the host's. The pages are then checked under what the
    frame has around the outlet, under what the layout has around the
    frame, and against the elements open above the outlet in both
    (SV-7d). Which components those are is read off each module's tree
    before it is walked (a component may be applied above its
    declaration), by the tags its view writes; a tag that a component
    declared *inside* that view also names is left out, and an imported
    component carries it from its module's check (in memory: a host's
    view is checked from source, and a module read by its printed
    signature — an `.rx` package — is not followed, and its applier is
    refused as before). Sound, and strict where it is not exact: a
    component between that *also* reads its own `props.children` has the
    pages checked at that place too (the same over-approximation a
    record's own component has had since MO-14f), and one that is given
    no children and applies nothing of the host's is still
    `NESTED_NOT_RENDERED` — `Card`, which renders `props.children`, is
    not an outlet. No word and no form; `rx-declare --host --routes`
    finds the outlet, and the entry's router component, through the
    `.rx` modules a layout or an entry imports. In a module checked on
    its own, outside the host's view, such a component is the plain JS
    component its row declares. S-module-40;
    `bench/tasks/router-rx-routes` (the outlet in `src/frame.rx`).

  *The bar (MO-8r), applied to MO-14f (2026-11-23).* Programs built and
  run with the checker of `e30ca84` and with this one:

  | | TanStack Router's file routes (`@tanstack/router-plugin`) | file-system routes on `@solidjs/router` (`filesystem-routing`) |
  | --- | --- | --- |
  | the program | an `.rx` entry that provides a context of the app's own and frames `<AppRouter />` (`router.tsx`: the library's `<RouterProvider>`); a root layout that renders `<Outlet />` inside its `errored` and `loading` regions; a page that reads the app's context | an `.rx` entry that provides a context of the app's own and holds `<Router />` (`router.ts`: `createRouter` over the manifest) in a `loading` region; a layout with `props.children`; a page that reads the app's context |
  | before | refused, from every entry: `CONTEXT_NOT_FOUND` for the page's `use team`, on the host's view | refused: `CONTEXT_NOT_FOUND`, and `ASYNC_OUTSIDE_LOADING_BOUNDARY` for the first load the entry's region holds |
  | before, the layout with `<Outlet />` | accepted — and still accepted with every region removed: the pages unchecked | (no outlet: its layouts take `props.children`) |
  | fallbacks | the host's view cannot claim the app's context (`export context team from "./team.rx"` is `NOT_EXPORTED`: MO-12e names a declared JS context); the router left undeclared changes nothing above the pages; what is left is to move the provision and the region into the root layout — another program than the one written. For the outlet alone: the route file passes it as the layout's children (TanStack's route files are TSX, below), which keeps every check | the same; with the entry in TSX nothing above the router is `.rx`'s to check at all |
  | now | accepted; the provision removed, the outlet beside the regions, a layout with no outlet, a declaration that does not import the outlet: each refused | accepted; the provision removed, the region beside the router, a hook above the router, a layout that forgets its pages, a declaration that does not import the router's component: each refused |
  | it runs | built by Vite, navigated in Chromium, `rx-verify` on the declaration: 3 claims hold | the same: 2 claims hold |

  Necessary: an app's own component around its router, providing what
  its pages share, is how both routers' apps are written, and it was
  refused with no undeclared, wrapped or vendor-typed way out. More than
  one library: two routers write the import (`AppRouter`; `Router`). The
  outlet is counted honestly: one router has that component. It is not a
  second form — the same import row, the same rule, applied one level
  down — and leaving it out would take a rule of its own ("only in the
  view's first record") written to keep one library's component out,
  while that library's ordinary layout stayed unchecked. On its own the
  outlet would not have passed: a route file can hand it over as
  `props.children`. `bench/tasks/router-provider` and `file-routes`;
  `examples/tanstack`.

- **MO-14g (A declaration derived from the router's own tree) —
  2026-11-24.** A host declaration restated the route tree by hand, and
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

- **MO-14h (A page given to a fn that `renders(H)`, under a host
  declaration) — 2026-11-25.** MO-11u places every component a
  `renders(H)` fn is given side by side beneath H: a fn's row cannot say
  which is whose child. So code-based routes written in `.rx`
  (`createRoute({ component: Person })`, `renders(RouterProvider)`) had
  their pages checked beneath the provider and nowhere more exact, and a
  root layout's `errored` and `loading` around its `<Outlet />` — the
  program TanStack's documentation writes — held no page: refused,
  `UNHANDLED_FAILURE`, strict (MO-11u, *Three things asked*, the second).
  The nesting is the router's own knowledge, and a host declaration
  states it (MO-14); since MO-14g it is read off the router object
  itself. What was missing is one sentence of how the two declarations
  meet:
  **where a program is under a host declaration, a component its view
  places, given to a fn declared `renders(H)`, is checked where the view
  places it — and not again side by side beneath H — when the
  declaration says the host renders through H** (it imports H from
  JavaScript, MO-14f). The fn's row says *beneath an application of H*;
  the view says *where* beneath it, with H's application on the way (the
  entry applies it, itself or through an `.rx` component, and the
  records are rendered there). The second statement implies the first,
  so nothing the row promised is dropped: the page is checked under
  everything above H's application, H's own `provides`, and what its
  layouts have around their outlets.
  - *What keeps its row.* A component the view does not place (a route
    added and the declaration not written again is `HOST_VIEW_STALE`
    before it is anything else); a component given to a fn whose H the
    declaration does not import (a toast: `renders(Toaster)`); a
    component given to a fn with no word (MO-11s, a root of its own).
    And a placed component applied by hand somewhere else is checked
    there too, as ever.
  - *Soundness.* It rests on what a host declaration already claims
    (MO-14d): a component the view names is rendered where the view
    says. That claim is derived from the router's tree and refused when
    it falls behind (MO-14g), and run by `rx-verify` (`placement`,
    `through:H`). A view that places a page under a layout the router
    does not render it in is a false declaration, as one that names a
    provision the host does not make is — and is found the same way.
    Counter-example to the rule without its condition: `toast(Saved)`
    with `Saved` also named in a router's view would lose its check
    beneath `<Toaster>`; with the condition it keeps it, since the
    declaration does not say the host renders through `Toaster`.
  - *No word, and no package's rule in a checker (CN-8).* The checker
    reads a set of placed components and a set of components the
    declaration imports from JavaScript, as it did. What knows TanStack's
    router object is the tool's reader, beside the one that knows its
    generated tree.
  Executable: S-module-41; `bench/tasks/router-code-routes` (the root
  layout's regions around its outlet; eleven variants, two of them a
  declaration fallen behind its router).

*The native shape (2026-11-24).* A route file that is its component, in
`.rx`, with the router's own tooling writing the tree:
  - **`filesystem-routing`** takes `.rx` route files as released
    (`extensions: ["rx"]`, each imported `?rx-page`), under
    `@solidjs/router`: a client-only build (`bench/tasks/file-routes`),
    or served and hydrated in **Solid's start mode** (11 CP-4d;
    `bench/tasks/start-mode`), which is the same program without the
    page, the mount file and the server.
  - **TanStack Router**'s generator takes them with one option, which
    is a fork's and not yet upstream: `routeComponentExtensions: { ".rx":
    "?rx-page" }` (`github.com/yumemi-thomas/router`, branch
    `rx-route-files`, `8688de6`, on `@tanstack/solid-router`
    2.0.0-rc.11). A file of the routes directory with such an extension
    is a route whose component is the file's default export; the
    generator writes the route object into `routeTree.gen.ts` itself and
    never reads the file as JavaScript. The option names no language.
    Built and run with the fork's two packages
    (`bench/tasks/router-rx-routes`: typed links and hooks from the
    generated tree, the router in the app's component, the dev server
    through an edit, a reload and a route file added). The packages are
    committed as tarballs and installed from the task's lock — the fork
    is a pnpm workspace no git dependency installs, and a test that ran
    only beside a clone would be green in CI by not running
    (`bench/tasks/router-rx-routes/vendor/README.md`). It is counted as
    what it is: a fork's build, not a release, and no part of MO-8r's
    count (it adds no word). **A route's options in the same file
    (2026-11-25)**: the fork's second option,
    `routeComponentOptionsExport: "route"` (`7ba2912`), has the
    generator take a component route file's options — `loader`,
    `validateSearch`, `beforeLoad` — from the export of that name,
    where the file's text exports it, and spread them into the route it
    writes; an `.rx` route file exports them as a record of functions
    (`export route = { loader: () => fetchPeople() }`, 11 CP-4d *A
    page's route options*). The TS route module that stood beside an
    `.rx` page for its loader is no longer needed, and the route's
    types — the loader's answer in `useLoaderData({ from })`, the search
    a link must give — come from the `.rx` file through the generated
    tree. Built and run (`bench/tasks/router-rx-routes`). Not among
    them: a route's own components (`errorComponent`,
    `pendingComponent`), which a record of an equation cannot hold
    (MO-11c).
  - **The fallback**, for TanStack Router and Start as released: a route
    file is a few lines of TSX that hand the route a component of an
    `.rx` module (`?rx-lib`; `bench/tasks/router-provider`,
    `start-route`). The declaration is derived all the same, through the
    route files.

*The bar (MO-8r), applied (2026-11-23).* Programs built and run, not
types read:

| | TanStack Router's file routes (its generator: `@tanstack/router-plugin`, and TanStack Start's) | file-system routes on `@solidjs/router` (`filesystem-routing`, SolidStart's conventions as a package of their own) |
| --- | --- | --- |
| the program | a root layout with `errored` and `loading` regions and a nav of `<Link>`s, pages that call `useParams({ from })` and `await` a loader that rejects | a layout `(app).rx` with the same regions, pages `(app)/index.rx` and `(app)/people/[id].rx` that call `useParams()` and `await` a query |
| how `.rx` gets in | the generator takes `.ts`, `.tsx`, `.js`, `.jsx` and `.vue` files (a fixed list) and reads a route file as JavaScript, so an `.rx` file is not a route file: each route file is a few lines of TSX that hand the route a component of `pages.rx?rx-lib` | natively: the scanner's `extensions` and `toRoute` are options, and each route file is imported as its page, `?rx-page` (11 CP-4d) |
| it runs | served, hydrated and navigated (Start); built and navigated in Chromium (the router's plugin) | built and navigated in Chromium |
| typed routes | the generated tree registers the router: `<Link to="/home">` and `useParams({ from: "/person/$id" })` are TypeScript's errors in the `.rx` | the plugin's generated manifest types the router's `paths`: `paths.person("9")` is TypeScript's error in the `.rx` |
| before, the hosts known (a whole-program build) | refused: 4 errors (`CONTEXT_NOT_FOUND` ×2, `UNHANDLED_FAILURE` ×2) on a correct program | refused in any build: 5 errors, since a route file's default component was a mounted view with nothing above it |
| before, the hosts not known | accepted, and nothing above a page checked: the layout's `errored` region removed is accepted | — |
| fallbacks | the library left undeclared: its hooks unchecked, and the pages' failures still refused; every page given regions of its own: not the program; the tree restated as records for a factory of the app's own (MO-8r): keeps the checks, gives up the generated types — and is not file-based routing: the route files then carry no component | the same; the factory form means writing the route tree by hand, which is what the library is used to avoid |

Necessary: the correct, common program cannot be written with a host
(refused), or its mistakes cannot be refused (not checked), and no
undeclared, wrapped or vendor-typed use changes that — a wrapper has to be
*given* the components by an `.rx` module, and here the host finds them.
More than one library: two routers by different authors, three packages
(`@tanstack/router-plugin`, `@tanstack/solid-start`, `filesystem-routing`
with `@solidjs/router/fs`), each with its declaration, its probe and its
task (`bench/tasks/router-provider`, `start-route`, `file-routes`). And it
adds no word. (SolidStart itself is not among them: `@solidjs/start` 2.2.3
asks for `solid-js ^1.9`. It is not needed for Solid 2: Start is a mode of
`@solidjs/vite-plugin` 3 — `solid({ start: true, ssr: true })`, the
entries, the dev server's render and the build — and `filesystem-routing`
is its file routes. An `.rx` app is built on the two since 2026-11-24:
`bench/tasks/start-mode`, 11 CP-4d.) What MO-8r withdrew stays withdrawn: those words described one
library's values; this describes what any host does with components.

*What it does not say.* No word marks a component as an outlet: `outlet`
(MO-11p) stays withdrawn, and a layout that renders the library's outlet
is credited by the host declaration's import of it (MO-14f), which says
nothing of the component beyond "the host renders through it". A route
file may still hand a layout its `<Outlet />` as `props.children`
(`bench/tasks/start-route` does). TanStack's route files, with the
generator as released, stay TSX: it has no option that admits another
kind of file (a fork adds one: *The native shape*, above). The physical
scan keeps a fixed list of extensions (`.ts`, `.tsx`, `.js`, `.jsx`,
`.vue`); a virtual route config (`@tanstack/virtual-file-routes`) may
name any file, and the generator then parses it as JavaScript and reads
`export const Route = createFileRoute(…)` out of its text, `.vue` alone
excepted in its source (run on 1.168.0: an `.rx` file in the routes
directory is skipped; named in a virtual config it throws, "Error
transforming route file … SyntaxError"); its plugin hooks run after that
transform. A limit of the library, recorded and not filed: a route file
is a few lines of TSX that hand the route a component of `pages.rx`. A
host with two views (two routers on a page) writes one list.

S-module-37, S-module-38 (MO-14f); the units
`a_host_declaration_places_the_components_a_js_host_renders`
(`ref/units.ts`, the crate's `modules.rs`); the tree-sitter corpus's two
*A host declaration* entries; `bench/tasks/start-route`,
`router-provider`, `file-routes`; `examples/tanstack`.

## Diagnostics this document adds

| code | bin | rule |
| --- | --- | --- |
| `WRITE_TO_NON_SOURCE` (rule MO-2) | S | MO-2a |
| `IMPORT_ROW_MISMATCH` | S | MO-4a |
| `MODULE_CYCLE` | S | MO-5 |
| `NOT_EXPORTED`, `MODULE_NOT_FOUND` | S | MO-6a; MO-8b for a declared JS module |
| `CONTEXT_NOT_FOUND` across modules | S | MO-7, RG-7b |
| `UNKNOWN_COMPONENT` for an undeclared JS component, `COMPONENT_AS_VALUE` outside MO-11c's and MO-11t's places | S | MO-11a, MO-11c, MO-11t, MO-11f |
| `CONTEXT_NOT_FOUND` for a JS hook with no provider above; `NOT_EXPORTED` for an undeclared JS context | S | MO-12b, MO-12a |
| `VIEW_FN_EXPECTED`, `VIEW_FN_MISPLACED` | S | MO-11k |
| `RESULT_AS_VALUE` | S | MO-10f: a prop whose type says which of its fields hold or fail, used as a value; MO-10l: a JS result with a `ref` part that waits or fails, used whole (a declared result's plain field no longer says so, MO-8r) |
| `DRAFT_ESCAPES` | S | MO-10i: a draft named outside its callback's own run, or handed where its parameter is not known |
| `UNHANDLED_FAILURE`, `ASYNC_OUTSIDE_LOADING_BOUNDARY`, `CONTEXT_NOT_FOUND` on a host declaration's view | S | MO-14c: what a component the host renders lets out of the view the declaration states |
| `NESTED_NOT_RENDERED` | S | MO-11i, MO-14f: a component a record nests others in renders none of its children |
| `NOT_EXPORTED` for a host declaration's import from JavaScript | S | MO-14f: the module's declaration declares no such component |
| `HOST_VIEW_STALE` | tools | MO-14g: a host declaration derived from the router's tree (`//@ routes`) that has fallen behind it — `rx-tsc`, `rx-verify`, a build; not a checker's |
| `CONTEXT_NOT_FOUND`, `UNHANDLED_FAILURE`, `CLIENT_QUESTION_UNHELD`, `ASYNC_OUTSIDE_LOADING_BOUNDARY` on a call of a fn declared `renders(H)` | S | MO-11u: what a component the fn is given lets out of H's children, at a place the program applies H (or, with none, under a root of its own) |
| `PARSE` for `renders(H)` where the file declares no component H, or on a fn that hands back a `Component` | U | MO-11u |

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
- MO-14: `loadModules` (the crate's `load`) looks for `host.d.rx` from the
  entry's folder upward, parses it (`parseDeclarations` reads the imports
  and the view as rows of kind `import` and `host`), and loads beside the
  entry's program the one `hostProgram` (`host_program`) makes of it, text
  for text and line for line — the declaration's imports, the view's tree
  given to `jsHostFactory`, a fn declared `Component` with the view's
  words in a declaration that exists only in the loader, and `<JsHostView
  />` as the default component — as `ModuleSet.host`, with `hosted` (the
  modules it imports) and `placed` (the components its view names).
  `checkModules` skips the mounted view of a hosted module, leaves placed
  components out of CP-4d's cautious check, and checks the host's program
  after the entry's, each diagnostic of the module that stands for the
  declaration reported on the declaration.
- MO-14f: the lowering keeps an import from JavaScript as the `.rx` import
  it reads as; the loader resolves its declaration as any import's, holds
  that it declares the name a component, and gives the host's set
  `through` (`declaration#Name`). Checking that set, such a component's
  symbol is marked, and each application of one in a component's view
  adds a reader of that component's `children` in the application's
  children region (`throughChildren`; the crate's `through_reads`, an
  occurrence of the prop with no expression) — so the summary of
  `children` (MO-3), the content model's `childrenAt` (SV-7d) and MO-11i's
  nesting are the ones `{props.children}` has. `NESTED_NOT_RENDERED` is
  asked after the application tree is resolved: a component a factory's
  record nested others in whose `children` reach no place they render.
- MO-14g: `tooling/rx-language-server/src/host-routes.js` — `pragmaOf`,
  `readRoutes` (the three sources), `derive` (the file), `drift` (the
  comparison, row for row, comments and layout aside), `sync`. `rx-declare
  --host --routes | --sync | --check` (`bin/declare.js`); `bin/tsc.js`
  asks `drift` of each host declaration an analysis names; `bin/verify.js`
  before `verifyHost`, which is handed `sceneRoutes`; `compiler/vite.mjs`
  (`hostInStep`) before a program is read. Neither checker has a line of
  it.
- MO-8s: `tooling/rx-language-server/src/declare-own.js` (`carried`: the
  module's text, parsed by TypeScript; `carry`: the draft's lines), called
  by `declare` for a relative module after its readings are settled;
  `known.js`'s `wraps`.
- MO-11u: `parseDeclarations` keeps `renders` on a fn's row and holds, at
  the end of the file, that it names a declared component. `importDeclared`
  binds the fn with `rendersIn` (H's key, `declaration#H`, and the keys H
  itself uses and provides) and marks H's region (`hostKey`). A call of
  such a fn that is given components applies them under a root that
  stands for H's children (a component root nothing applies; `unplaced`),
  and each application of H records its children's region. After the
  application tree is resolved, `sitesOf` gives, for a component's root
  or the program's, each place H is applied as the catches and provisions
  between H's children and that root — through the components that
  component is applied in, by their own lists (an imported one's
  `hosts`) — and each call's root is summarised as any component's is
  (`esc`), H's own keys taken off. Both are in the module's signature
  (`ModSig.hosted`, `ModSig.hosts`, `CompSig.hosts`), printed and read by
  `signature.ts` / `signature.rs`. `judgeHosted` (`judge_hosted`), run by
  `checkModules` once the set is checked (and with a host's view, MO-14,
  over both sets), puts every module's calls against every place of the
  program. MO-11c's nested components: `parseDeclarations` marks a prop
  whose type `holdsComponent` (`holds_component`), and
  `componentValues` walks the literal the prop is given.
- MO-1c: `checkModules` passes `dependency` for every module but the
  set's entry, and a dependency's `view` is not walked.
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
   - *`nests(…)`, `renders`, `renders(later)`* (MO-11i, l, o, p; one vocabulary, MO-11r)
     are kept (`renders(root, …)`, MO-11n, was among them and is
     withdrawn, MO-8r: a call with no word is that reading already). They describe the shape of a call's arguments and where its
     components end up, which no type says, and each replaces DV-24's
     blanket assumption with a narrower, checked one. Without them a
     library that takes components must be refused (`COMPONENT_AS_VALUE`,
     kept for every call without a word) or trusted; with them, a layout's
     boundaries reach its routes and a toaster's root gets nothing it was
     not given. No library name appears in them.
   - *Typed params in TypeScript* (MO-11h, TY-1d) are kept. The router's
     own types already compute a path's params; restating them as rows
     would duplicate and drift. Since a production build type-checks, they
     are not optional. (Joining a nested route's literal paths in the
     projection, `joins(path)`, was taken with them and is withdrawn,
     MO-8r: it gave one router's types what they do not have in TSX.)
   - *`pending`/`fails(…)` on result fields, nested paths included* (MO-10f)
     were kept at field granularity, and are withdrawn from declarations
     (2026-11-23, MO-8r: one library). As it was ruled: A store is read field by field, and
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
   - *`signal` parameters* (MO-10h) were kept over a general escape, and
     are withdrawn (MO-8r): the signal is made in three lines of the app's
     own JavaScript (MO-10c), so `.rx` still never holds a writable Solid
     signal, and no word changes what the compiler emits.
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
