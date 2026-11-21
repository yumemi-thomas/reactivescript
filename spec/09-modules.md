# 09 — Modules

**Status: OPEN (2026-10-23).** A program is a set of `.rx` modules. This
document says what an import binds, what crosses a module boundary, and what
the checker knows about another module (its signature, never its body). It
makes 08 CN-4b executable. `ref/src/modules.ts` loads a program,
`ref/src/check.ts` checks it module by module, and every runner executes
it: the interpreter, the Solid oracle, and the compiler, which emits one ES
module per `.rx` module (the compiled, server and types runners). `S-module-1` and `S-app-shop` cover it; `S-module-3`
covers a module read by its `.d.rx` (MO-9).

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
- **what it stores (O-3):** each prop it stores where the stored value
  outlives the component (in a source of its module, or through a
  provision above it), passed on to a component that does included. A
  closure passed for one is checked at the application against that
  place. `.d.rx`: `retains(onPick: module, onFocus: ./form.rx#fields)`.

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
  `import … from "./api"`, the file `./api.d.rx` (an extension `.js`,
  `.mjs` or `.ts` on the import is dropped). It declares each export in
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
  `action` is an action.
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
  calls it (S-module-8).
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
  | what calling it, or rendering it, does | after the signature | `rejects(E)`, `instantiates`, `uses(c)`, `provides(c)`, `renders`, `renders(root, c…)`, `renders(later)`, `nests(…)`, `joins(field)`, `forwards`, `outlet`, `shape(…)`, a component's `fails(E)`, `trusted` |
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
  row (`exists`, `pure`, `uses`, `provides`, `fields`, `fails`,
  `callbacks`, `draft`, `placement`; `rxc serve`'s `rows` answer), rx-verify
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
     folder, `rx-types/@kobalte/core/dialog.d.rx`);
  2. the package's own, beside the file the import resolves to (MO-10c);
  3. a shared one, `node_modules/@rx-types/<scope>__<name>/index.d.rx` (a
     subpath: `<subpath>.d.rx`), named as `@types` packages are;
  4. a generated one, `node_modules/.rx-types/<spec>.d.rx`, drafted by the
     tooling from the package's types (MO-8l).

  The project's comes first so that a wrong shipped declaration can be
  replaced without waiting for the package; MO-8f's pin keeps it from going
  stale. The compiled import stays `from "<spec>"` (MO-8c). In rx-tsc, a
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
  The draft is `rx-declare`'s from types alone (the package is not run):
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

## MO-9 — A signature read in place of its module

- **MO-9a.** `import … from "./x.rx"` where there is no `x.rx` but there is
  an `x.d.rx` beside where it would be: the importer is checked against
  that file, read as `x.rx`'s signature (MO-3), and never sees a body —
  separate checking, as one crate is checked against another's metadata.
  With both files, the `.rx` is the module and the `.d.rx` is not read.
  With neither, `MODULE_NOT_FOUND`.
- **MO-9b.** The text is the signature, all of it (`ref/src/signature.ts`
  prints and reads it). An importer checked against a printed `.d.rx` gets
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
  the call made nodes), so it is written only for a primitive with neither —
  one that registers a listener, or returns a store. A call is an
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
  - Anything else, a store or a plain value, is a value. A store's fields
    track at run time as Solid's do. A store passed *in* is likewise passed as
    itself; an `.rx` structured source is a store behind a signal slot (11), so
    a whole write (`todos := next`) swaps it, and a value parameter misses
    that: `SNAPSHOT_ARGUMENT` stands (`peek todos` says it is meant), and an
    API that takes an accessor of a store declares `ref`.
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
  `dist/index.d.rx`. No export condition is needed. A package whose
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
  1` calls `next` once and updates one element. The draft lives as long as
  the library's call of the callback (revised 2026-11-21): a library may
  take it back when the callback returns (a revocable proxy, Solid's
  setter), so a closure made inside the callback, which may run later,
  may not capture it, to write a path or to read one (`DRAFT_ESCAPES`);
  what such a closure needs is copied into a local first. Passing the draft
  itself to a function the callback calls is that function's contract with
  the library, as any JS argument is. `rx-verify` checks the row by running it: the setter must hand its
  callback an object, and a write to it must be kept (a library that
  hands a copy is a mismatch). S-module-25; `examples/formisch` runs
  Solid 2's own store this way.

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
  anywhere else is `VIEW_FN_MISPLACED`. A render prop under another name is
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
  placement (MO-11s). (Revised 2026-11-21.) The checker holds the program
  to it (revised 2026-11-21 after a second review): the bound value, and an
  equation that only names it, may be read through (`table.rows`) and
  rendered in the binding's own view, but not passed to a component's
  prop, provided, exported, written to a source, or passed to a call;
  each is `RENDERS_ESCAPES`, since the components would render under other
  boundaries and providers than the binding's (S-module-16).
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
  says nothing of what it carries, so a `renders` prop given a value
  imported from another `.rx` module is `RENDERS_ESCAPES` (revised
  2026-11-21): the carried components are checked in the module that
  builds them, at its own `renders` props. Without MO-11p, a route's nested components are checked as
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
  (Kobalte's `<Dialog>` with `<Dialog.Trigger>`, `<Dialog.Content>`; Ark's
  `<Dialog.Root>`), the object a component itself or not. A `.d.rx`
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
  declared `Dialog.Root` that Kobalte does not have fails the check).
  `rx-declare` drafts the members of an exported object of components,
  and running them settles their rows: a part that throws rendered alone
  but renders inside its object's root reads a context that root provides.
  A prop typed with `Component` in a union (`as?: string | Component`, a
  polymorphic `as`) takes a component value as a `Component` prop does
  (MO-11c). S-module-24; `examples/kobalte` runs Kobalte 2.0 (alpha) in
  Chromium (`compiler/test/kobalte.mjs`).
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
  3. *Travel.* A value checked at the binding (`renders`) stays there:
     one that leaves is `RENDERS_ESCAPES` (MO-11l). A carried value
     (`renders(later)`) may travel freely through equations, records and
     carrying calls (`rootRoute.addChildren(…)`, `createRouter(…)`) within
     its module; each `renders` prop it reaches is a consuming render,
     checked there, as often as it is rendered. It may not be rendered in
     another module (MO-11o).
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
