# 13 — Types

**Status: executable, 2026-10-25** — `npm run -s types` checks every
scenario's program (and each variant's) and S-types-1's refusals.

Types are TypeScript's (07 §2). This document says how the program is
checked against them: the checker of 08 does not type the program; the
compiler projects the checked program to TSX and TypeScript checks the
projection, with Solid's JSX types — as TSRX's `projectTsrxForTypecheck`
does for `.tsrx`. Nothing here is a second type system.

---

## TY-1 — The projection is checked by TypeScript

- **TY-1a.** After the checks of 08 pass, the program is projected
  (`ref/types/project.ts`): one TSX module per `.rx` module, one `.d.ts`
  per `.d.rx`, and a prelude that declares the language's forms. TypeScript
  checks it (`strict`, with untyped parameters `any`), and every error is a
  compile error (CN-1a), reported on the `.rx` line of the declaration,
  statement or markup item it came from.
  The TypeScript that checks is TypeScript 7, as tsrs at the one version the
  tooling pins implements it (2026-11-24): `rx-tsc`, the build's gate, the
  check of a draft, TY-6, the editor's type errors and this repository's
  `npm run types` ask it, and nothing else answers in its place. What
  TypeScript 7 removed (`baseUrl`, `moduleResolution: node10`, `target: ES5`)
  is an error of the project's tsconfig.
- **TY-1b.** The projection is for checking only. It is never run, and its
  order is dependency order (E-7: equations are a system; C-1 makes it a
  DAG).
- **TY-1c.** In the product the compiler emits the projection beside the
  JavaScript (11, CP-1a) and hands it to TypeScript; an editor uses the
  same projection. The crate emits it with mappings onto the `.rx` (11
  CP-8c: `rxc project`), the same text as `ref/`'s. A component's props type is
  written without the row words on its fields (2026-11-22: `query: {
  data: pending fails(Error) T }` is `query: { data: T }` to TypeScript,
  09 MO-10f), each piece between them mapped where it is.
  A JS host that imports an `.rx` module `?rx-page` or `?rx-lib` is typed
  by the module's projection: its exported components, the page's default,
  and — since 2026-11-25 — each exported record of functions (`export
  route = { loader: …, validateSearch: … }`, 11 CP-4d), as the module's
  own value (`export declare const route: typeof M.route`). That is how a
  route file's options type the route a router's generator writes of it,
  and through the registered router the page that reads them
  (`useLoaderData({ from })`) and every link to the route.
- **TY-1d (Types in the build) — proposed 2026-11-19.** A production
  build type-checks: the Vite frontend runs `rx-tsc` over the project's
  `tsconfig.json` once per build, and a type error fails the build on its
  `.rx` line, as a checker error does. So what only TypeScript can check
  (a route whose path lacks a param its page needs, MO-11h; a `.d.rx`
  that disagrees with its module, TY-6) cannot ship by being left out of a
  CI step. A check that cannot run fails the build too (revised
  2026-11-21): a project with a `tsconfig.json` and no language server to
  run `rx-tsc` with, or, when `RX_TYPECHECK=1` asked for the check, no
  `tsconfig.json`. A production build with no `tsconfig.json` is not a
  TypeScript project and only says its types went unchecked.
  `RX_TYPECHECK=0` builds without the check, for a project that runs it
  elsewhere. Once per build means each build (revised 2026-11-21 after
  review; the first version checked once per process, so the rebuilds of
  `vite build --watch` shipped unchecked): the check runs again when an
  entry is compiled and the last check is stale, and a build whose check
  failed fails at each of its entries until one changes. A rebuild that
  compiles no entry is checked too (revised 2026-11-21 after review; an
  edit of a `.ts` module alone rebuilt unchecked): where Solid's plugin
  calls front ends at each build's start (`Frontend.buildStart`), the
  check runs again there when the last one is stale, and a failed check
  fails that build before it bundles. A check is stale when anything it
  read is different now, by content (revised 2026-11-21 after review,
  three times; mtimes and a walk of the folder missed a file restored
  with an older mtime, two files swapped with `mv`, a file saved while
  the check ran, a `checkJs` file, an `include` outside the tsconfig's
  folder and an imported `.json`): `rx-tsc --rx-inputs` records each file
  the run read with the hash of what it read, each path it looked for and
  did not find, and each folder it listed, and the check is stale when a
  file's content differs, a missing path appears or a listing changes.
  A listing counts what a type-check could take, and nothing else
  (revised 2026-11-22 after review): the folders in it, which a glob may
  descend into, and the files of the kinds the project's program holds —
  TypeScript's, `.rx`, JavaScript's under `allowJs`, `.json` under
  `resolveJsonModule`, and `package.json`. With `"include": ["**/*"]`
  TypeScript lists every folder of the project, so every name counted
  made a README beside the sources, or the assets a build wrote under
  `dist/`, a reason to check again at each build start; a source file
  added anywhere below still is one (`compiler/test/vite-gate.mjs`).
  A plugin without the hook checks
  only the rebuilds that compile an entry (`compiler/test/vite-watch.mjs`).
  Each check belongs to its project (revised 2026-11-21 after a second
  review): a build whose entries sit under two `tsconfig.json` files runs
  one check for each, keyed by the tsconfig's real path, and each fails
  only its own entries and is re-checked on its own files; one project
  passing does not stand for another. A `wholeProgram` build (E-5a) runs
  `rx-tsc --rx-whole-program --rx-hosts …` with the hosts the build
  found, so the gate reads the crate's rows from each program's entry as
  the build does (a kept `peek` the whole program shows never changes is
  not refused by the gate alone), while TypeScript's errors fail it as
  before (`compiler/test/vite-gate.mjs`).
  The dev server leaves types to the editor,
  which runs the same projection. A build is made from its declarations
  as from its modules: the frontend watches each `.d.rx` the program read
  and re-checks the program when one changes. One that appears where the
  program looked for it (MO-8k, MO-8a) is read at the program's next
  compile, whatever starts it, with no restart, and counts as a change
  for the next build's type-check; it does not start a compile by itself,
  because neither Vite's dev server (which resolves what a module watches)
  nor Rolldown's `vite build --watch` watches a path that has no file.

## TY-2 — What each form is, as a value

| form | to TypeScript |
| --- | --- |
| `x = e` (an equation) | a `const` of `e`'s type; with `x: T = e`, of `T` (row words such as `pending` are not types, CN-4a) |
| `source x := e`, `source x = e` | with a written type, that type — not what the initializer narrows it to; without one, the initializer's type widened: a literal to its primitive, `null`, `undefined` and `[]` to `any` (they say nothing about later writes) |
| `x := v` | `v`, which is no function, or a function of the slot (W-6), checked against the target's type |
| `x.a := v` | `v` (or a function of the slot, W-6) checked against the target's type: a path may be a draft's, where a function can be the value (ST-3a) |
| in a generic fn, an equation whose type is a type parameter's | not held to R-1a: what `T` is, is the call's to say, and the caller's equation is held |
| in a generic fn or component, a source of a type parameter's type written with a `T` (`value := v`) | taken: whether `T` is a function is the caller's to say, and there it is applied (W-6), as Solid's setter does. A source of a known type is held as above |
| `await e` | the answer's type (`Awaited`); `await* e` the stream's element type; `-> v` adds `v`'s type |
| `e catch (x: A \| B) => alt` | `e`'s type or `alt`'s; `x` is `A \| B` (untyped: `Error`) |
| `pre x -> i`, `latest e`, `peek e` | the node's own type; `pending? e` is `boolean` |
| `use c` / `provide c = e` | the context's type / `e` checked against it (RG-7) |
| `error C(a: T) => …` | a class `C` (a subclass of `Error` with the field `a: T`), constructed by `C(a)` |
| `fn`, `action`, `server fn` | functions of their parameters; an action and a server fn return a promise |
| `if x { … }` | the branch narrows `x` (RG-1c); a handler is a closure that runs later, and TypeScript's rules for closures apply to it |
| `for x in xs { … }` | `x` is an element of `xs` |

## TY-3 — Views

- **TY-3a.** A view is JSX over Solid's JSX types (`@solidjs/web`): an
  element's attributes, and a component's props where it is applied (its
  `props: P`; children are `P`'s `children`), are checked there.
- **TY-3b.** What a reader may insert is Solid's `JSX.Element`, which takes
  any object (a renderer's value). So inserting a record by mistake is not
  a type error; it stays Solid's `UNRECOGNIZED_INSERT_VALUE`, at run time.
  This follows Solid, which does nothing more.
- **TY-3c.** A component cannot know where it is applied: a module-level
  `Item | null` read in a component is `Item | null` there, whatever branch
  applies it. Pass the narrowed value as a prop, or narrow inside.
- **TY-3d (A component that declares no props) — 2026-11-24.** `component
  Saved() { … }` declares no props (RG-4b: reading them is `UNBOUND`), and
  is projected as a function of nothing, `function Saved() { … }`. It was
  `function Saved(props: any)`. A function of nothing is what TypeScript
  holds wherever a component is asked for (`Component<P>`: fewer
  parameters are assignable) *and* where a library asks for a function
  that takes none — `solid-sonner`'s `toast(() => JSX.Element)`, a render
  function — which a function of one `any` is not (TS2345: "Target
  signature provides too few arguments"); and an attribute given to such a
  component where it is applied is TypeScript's to refuse, as the
  component cannot read it. A component whose props are named and not
  typed (`component C(props)`) stays `props: any`.

## TY-4 — Modules

- **TY-4a.** An `.rx` import carries types: `export type T` crosses an
  import (MO-6c), as does every export's type.
- **TY-4b.** A `.d.rx` is its JS module's `.d.ts`: each function's
  parameter types and return type (`export pure fn f(id: number): Promise<User>`),
  its `export type`s, and its error classes (MO-8). A JS module with no
  declaration file is `any`. A `ref` parameter or result is written as JS
  has it, an accessor (`() => T`), and the projection writes the calls the
  same way (proposed 2026-11-18): a `ref` argument is `() => (e)`, and a
  `ref` result, or a tuple or record part of one, is read with a call, so
  the binding has its value's type. The projection then type-checks against
  a library's own `.d.ts` as it does against the projected one (S-module-13).
  `rx-tsc` uses the projected `.d.ts` where a JS module has a `.d.rx` and no
  types of its own (`tooling/rx-language-server/src/declarations.js`).
  *A method, and a default export (2026-11-25).* A method's row (09
  MO-8t) is a member of its object in the `.d.ts`: of a declared value,
  a field of its type (`export declare const toaster: (T) & { show:
  (toast: Component<…>) => number; }`); of a declared fn, a function of
  the namespace TypeScript merges with it (`export declare namespace
  toast { function success(message: string): number; }`). The row named
  `default` (MO-8u) is the module's default export (`declare function
  __default(): (() => boolean); export default __default;` — written
  `export declare function default`, which TypeScript refuses, until the
  types runner met one). In the projection of an `.rx` module a method's
  call is the member call it was written as (`toaster.show(Saved)`),
  typed by the library's own declaration, and a default export is
  imported as it is written (`import { default as useOnlineStatus }`).
  Which `.d.rx` declares a module is one list, read in one order by the
  checker and the tooling (09 MO-8a; revised 2026-11-22 after review):
  `./x.js` and `./x.ts` by `x.d.rx`; every other JavaScript or TypeScript
  module — `./x.mjs`, `./x.cjs`, `./x.jsx`, `./x.tsx`, `./x.mts`,
  `./x.cts` — by the file's whole name (`x.tsx.d.rx`), then by `x.d.rx`.
  (The checker read only `x.tsx.d.rx` for `./x.tsx` and the tooling only
  `x.d.rx`, so each ignored the file the other read.)
  A component given by name to a prop typed `View` (09 MO-11t) is projected
  applied, `fallback={<Empty />}`: an element is what the library's type
  takes, and a prop the component requires is then missing on its name
  (2026-11-23; S-module-34).
- **TY-4c.** An `.rx` module read by its `.d.rx` (09 MO-9) is typed by the
  `.d.ts` TypeScript emits from that module's projection (TY-1c), shipped
  beside it: the `.d.rx` carries rows, the `.d.ts` types. `ref/` has no such
  `.d.ts`, so there its exports are `any`. The file is `x.rx.d.ts`, what
  TypeScript looks for when a module imports `./x.rx` and there is no
  `x.rx` (rx-tsc writes it with `--declaration`). A package written in
  `.rx` ships it for each module beside the module's printed signature (09
  MO-13d), and an import whose declaration is such a signature is
  projected as an import of that module, by its path from the importer,
  so the same file types it; the package's `x.d.ts` is another file, the
  types of the JavaScript a `.tsx` app imports (09 MO-13f), written from
  the first by kind: `typeof` the projection's export for a component, a
  fn and an action, an accessor of it for a source or an equation, and for
  a fn that instantiates its parts (09 MO-13i: an accessor of the field's
  type, the action's type, the value's), and each `ref` parameter as an
  accessor or the value.

## TY-5 — Rules the projection states as types

- **TY-5a (SF-6a statically).** A server fn's parameters and result are
  checked to be data: a function, or an instance of a class (a `Date`),
  where the types are known is `WIRE_VALUE` at compile time. Where they are
  `any` — an untyped parameter — the run-time check stands.
- **TY-5b (R-1a statically).** An equation is projected as `__.eq(e)`,
  whose type is `e`'s and which refuses a promise or an async iterable on
  any branch: `MISSING_AWAIT`. Where the type is `any` the check is silent
  (04 R-1a). (Ruled 2026-10-28; S-types-1.)

## TY-6 — A declaration is checked against its module's types (proposed 2026-11-18)

- **TY-6a.** The checker trusts a `.d.rx` (09 MO-8b). `rx-tsc` checks, for
  every `.d.rx` that declares a JS module beside it, what TypeScript can:
  each declared export is the module's real export, assigned to the
  declaration's own type. A `ref` parameter or result part is an accessor
  (`() => T`), a component a function of its declared props, an error class
  a constructor of an `Error`. A missing export, a `ref` the real function
  does not take, a prop type the real component does not accept, or a
  result the real function does not give is `DECLARATION_MISMATCH`, on the
  declaration's line, with TypeScript's reason.
  A component whose props are written as a type and a record of the
  fields that carry words (09 MO-8o) is a function of their intersection,
  its type parameters found from the type alone (`props: P &
  NoInfer<{ … }>`), and each field of the record is held against the
  type's prop of that name (TY-6f). A fn has one row (09 MO-8b): of a
  library's overloads, the row is held by the one that fits it.
  A method's row (09 MO-8t) is held to the member it names
  (`toaster.show` to the module's `toaster.show`), and the row named
  `default` to the module's default export (MO-8u), each as any fn's or
  component's is.
  A package a row names by a bare specifier (`import("dep").T`) in a
  package's declaration is resolved as the declared library resolves it,
  from the library's location and then from beside the declaration (09
  MO-8o), so whether a row holds does not depend on how the install laid
  the library's dependencies out.
- **TY-6b.** The direction is the boundary's: the real export must fit the
  declared one, so `.rx` code checked against the declaration is right
  about the module. A declaration may say less than the types (`any`, an
  omitted parameter type), never something else.
- **TY-6c.** Rows TypeScript cannot see (`pure`, `uses`, `provides`,
  `pending`, `fails`) are not checked here. A module with no TypeScript types
  of its own (no `.d.ts` beside it, none from its package) is typed by its
  `.d.rx` (TY-4b: `rx-tsc` gives TypeScript the projected `.d.ts` in its
  place, without writing it), and there is nothing to check it against: a
  hand-written `.d.ts` would be the same assertion, as `pure` is (CN-5).
- **TY-6e (Which declarations, revised 2026-11-21 after review).** What
  `rx-tsc` checks is what the compiler consumed: the crate's loader reports
  each declaration it read with the module that imported it and the
  import's own text (`rxc serve`'s `analyze` answers `declarations: [{file,
  importer, spec}]`), and each is checked against the module that import
  resolves to from its importer — in any folder, and per installed copy
  where two importers resolve the same declaration to two versions. A
  `.d.rx` the tsconfig names itself is checked too, against the module
  beside it (an audit, or a package that ships only declarations). A
  `.d.rx` that only sits beside a module, imported by nothing and named by
  nothing, is not the program's and is not checked. The same set is what a
  version pin (09 MO-8f, resolved from each importer) and strict
  declarations (MO-8j, TY-7) apply to.
- **TY-6d.** The crate writes the check (`rxc serve`'s `boundary` request,
  `project.rs` `boundary_file`); `rx-tsc` type-checks it in memory beside
  the `.d.rx` with the project's compiler options
  (`tooling/rx-language-server/src/boundary.js`). Nothing is emitted and
  nothing runs.
  A row that writes a conditional over its own type parameters is held as
  an instance of its type (`type __decl_f<__Any = unknown> = <T extends
  __Any>(…) => …`; 2026-11-24): TypeScript 7.1 does not relate such a type
  to an instance of it, so a library's signature did not fit the same
  signature in its declaration (microsoft/TypeScript#64673). It says the
  same of the row: a parameter bound by `unknown` is bound by nothing.
- **TY-6f (The record after a props' type, added 2026-11-22).** A
  component whose props are a type and a record (09 MO-8o) is held to
  `P & NoInfer<{ … }>` (TY-6a), and that says nothing of the record: an
  intersection only narrows, so the library's component takes `P & R`
  whatever `R` is. Each field of the record is therefore held on its own:
  - *the prop exists*: the field's name is a prop of `P` — of one member
    at least where `P` is a union of records; any name where `P` has an
    index signature, or is `any`;
  - *the field's type fits the prop's*: the type the field is written with
    (its word taken off: `handler (v: Option) => void` is `(v: Option) =>
    void`) is assignable to the library's type for that prop (the union of
    what the members of a union give it).

  The direction is TY-6b's. The record may say *less* than the library
  accepts (`size?: "s" | "m"` of a `"s" | "m" | "l"`), and then `P[k] &
  R[k]` is `R[k]`: the record's type is the prop's type to the program,
  and every value it admits is one the library takes. For a function that
  reads: the callback as the record types it takes everything the library
  calls it with (`(v: Option) => void` does not fit `(v: Option | null) =>
  void`: a handler written against the record would be called with a
  `null` it was told it never gets). The other direction would let the
  record claim more than the library takes, which the intersection never
  delivers; and an unrelated type makes the prop `never`, so a correct
  program is refused for the declaration's mistake (S-module-32).
  A failure is `DECLARATION_MISMATCH` on the row, naming the prop, the
  type the record gives it, the props' type, and TypeScript's reason with
  the library's type for the prop.

  The row's type parameters are, in these checks, types of their own —
  each its default, else its bound, else a type nothing else is, and `any`
  where a bound comes back to the parameter itself — because TypeScript
  reads no prop of a conditional or mapped type over a type parameter
  (`PolymorphicProps<T, …>`), so a field cannot be held for every `T` at
  once. It is held at the instance a program gets when it chooses nothing,
  which finds a retyped field and a misspelt one; a field that fits there
  and not at another `T` is not found. A row the module itself does not
  fit (TY-6a) reports that, and its record's findings only where they are
  a field's own. The crate writes the checks with the row's
  (`project.rs` `boundary_checks`: a line each, and for each what it asks
  and of which prop); `ref/` has no boundary check to keep in step (TY-6d:
  it is the crate's to write) and reads the same row, record and type
  parameters (the unit `a_props_record_is_held_to_the_props_type` in
  both; `tooling/rx-language-server/test/tsc.js` runs it against a typed
  module).

## TY-7 — Strict declarations (proposed 2026-11-20)

  *At one instance (decided 2026-11-23).* The row's type parameters are
  types of their own in these checks (default, else bound), so a field is
  held for one choice of them, not for every one. It stays so: holding it
  for all `T` needs TypeScript to read a prop of a deferred conditional
  type, which it does not, and no row of the benchmark or of the coverage
  suite's 85 component rows is one the instance lets through wrongly.
- **TY-7a.** With `--rx-strict` (or `"reactivescript": { "strict": true }`
  in the tsconfig), `rx-tsc` reads, beside each `.d.rx` the program
  imports (as the loader resolved it, TY-6e) or the tsconfig names, the record `rx-verify --record` wrote (09 MO-8j). A row is
  accepted when the record shows it held (`ok`) or had nothing to run
  (`n/a`), by the hash of its text. Any
  other row is `UNVERIFIED_ROW`, on the row's line: nothing verified it,
  it changed since the record, rx-verify found a mismatch, or rx-verify
  could not check it (no probe, no scene).
- **TY-7b.** TY-6 checks what types can see; TY-7 asks that the rest
  (`pure`, `uses`, `provides`, `pending`, `fails`, placement, drafts,
  callbacks) was run. (A row could say `trusted` and pass: withdrawn
  2026-11-22, 09 MO-8r.)

## Found by the type layer (2026-10-25)

Every scenario type-checked once these were fixed; each was invisible
while types were text:

- **A parser bug.** `source issues: Issue[] key id = …` read `key id` as
  part of the type, so the source lost its key (ST-4) — S-ai2-tracker's
  rows kept identity by luck. Fixed: the type ends where the key begins.
- **Missing type imports** in `examples/shop/ui.rx` (`Product`) and the
  settings example (`Theme`, `Density`, `Settings`), removed when an
  earlier reading said types do not cross an import (MO-6c says they do).
- **A write TypeScript refuses** in `examples/todo.rx`: `for f in ["all",
  "open", "done"] { … filter := f }` writes a `string` to a
  `"all" | "open" | "done"`; the list is now typed.
- **Nullability that held only by where a component is applied**
  (S-ai2-search's `ItemView`, TY-3c), or by a handler running while its
  branch is live (S-ai2-tracker): both now narrow where they read.

## Decisions (all ruled; the last open ones 2026-10-26)

1. **TypeScript checks the projection** (ruled 2026-10-26) — no type system of our own; the
   checker's rules (08) stay the language's, the types TypeScript's.
2. **Strict, but untyped parameters are `any`** (ruled 2026-10-26) (`noImplicitAny` off):
   scenarios and small programs leave parameters untyped; a written type
   is always checked.
3. **A source without a type is widened** (TY-2; ruled 2026-10-26): a source is written
   later, so its initializer's literal type would refuse every other write.
   **A write is typed by the source's own type, not by a narrowing around
   it** (2026-11-26): `if (a) { a := undefined }` on a source declared `T |
   undefined` writes `undefined` — an `if` narrows what a read is, and a
   write is no read. The projection names the source's type beside its
   declaration (`type __w_a = typeof a`) and the write is of that type
   (`__.set<__w_a>(a)(…)`): a type query at the write itself would be
   narrowed as the read is. S-types-3.
4. **What a reader inserts is Solid's `JSX.Element`** (TY-3b; ruled 2026-10-26), not a
   narrower type of our own. Where more could be done: a narrower
   insertable type would refuse `<p>{record}</p>` statically at no run-time
   cost; noted, not adopted, since it departs from Solid's types.
