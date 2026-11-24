# 09 — Modules

**Status: OPEN (2026-10-23).** A program is a set of `.rx` modules. This
document says what an import binds, what crosses a module boundary, and what
the checker knows about another module: its signature, never its body (08
CN-4b). The rules are here and nothing else is. How each was reached, what was
measured, what was withdrawn and the implementation notes are in
[`archive/`](archive/README.md); how the tools draft, audit and verify a
declaration is in
[`tooling/rx-language-server/DECLARATIONS.md`](../tooling/rx-language-server/DECLARATIONS.md).

Two notations share the extension `.d.rx`: a *declaration* of a JavaScript
module, written or drafted (MO-8, MO-10 to MO-12), and a *printed signature*
of an `.rx` module (MO-3, MO-9, MO-13). MO-13b lists where they differ. Both
checkers read both. Every rule here is the language's or Solid's; none is a
package's (08 CN-8).

Contents: [1 instantiation](#mo-1--instantiation) ·
[2 value boundary](#mo-2--the-value-boundary) ·
[3 signatures](#mo-3--signatures) · [4 rows](#mo-4--rows-at-the-boundary) ·
[5 cycles](#mo-5--no-cycles) · [6 names](#mo-6--names) ·
[7 contexts](#mo-7--contexts-across-modules) ·
[8 declarations](#mo-8--declaration-files-for-js-modules) ·
[9 signatures read in place](#mo-9--a-signature-read-in-place-of-its-module) ·
[10 Solid libraries](#mo-10--solid-libraries) ·
[11 components and placement](#mo-11--solid-components-and-routers) ·
[12 JS contexts](#mo-12--js-contexts) ·
[13 `.rx` packages](#mo-13--packages-written-in-rx) ·
[14 host declarations](#mo-14--what-a-js-host-renders-a-host-declaration) ·
[diagnostics](#diagnostics-this-document-adds) · [withdrawn](#withdrawn-rules)

---

## MO-1 — Instantiation

- **MO-1a.** `import { a, b as c } from "./x.rx"` binds names that `x.rx`
  exports. The path is relative to the importing file.
- **MO-1b.** Each module is instantiated **once per app**: its top-level
  sources, equations and effects exist once, and every importer reads the
  same ones. Module-level state is app state, not a JS module variable: on
  the server an app is a request (SV-4), so nothing in it outlives or is
  shared beyond its request. Dependencies are instantiated before their
  importers.
- **MO-1c.** A module has no markup at its top level (`TOP_LEVEL_MARKUP`).
  The app's view is the entry module's default component, `export default
  component App() { … }`, mounted by the runtime as Solid's
  `render(() => <App />, el)`. The entry alone is mounted. A default
  component of a module imported for its exports is a component like any
  other, checked where an importer applies it.
- **MO-1d.** A declaration in a nested block may not shadow a name an import
  bound (`SHADOWED_IMPORT`): rename one, `import { filter as keep }`. A
  parameter, a loop's variable or a local may; a name is its binding's by its
  scope.

## MO-2 — The value boundary

- **MO-2a.** An imported source is read-only in the importing module:
  `x := …` and `guess x := …` through an import are `WRITE_TO_NON_SOURCE`
  (rule MO-2). The exporting module exports actions as its write interface.
- **MO-2b.** `refresh x` and `affects x` of an imported question are allowed:
  they ask, they do not write.
- **MO-2c.** Reading an import is an ordinary read: rows, holds and lanes are
  the same as for a local name.

## MO-3 — Signatures

A module is checked against its imports' **signatures**, never their bodies.
The checker infers a signature for every export.

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

- **what escapes its root:** the failure classes its own readers, and the
  components it applies, let out, which continue at each place it is applied;
  and the provisions it `use`s that nothing inside it provides;
- **per prop:** the classes discharged on *every* path from the component's
  reads of that prop to its root. A class not in that set comes out at the
  application with that application's argument. For `children`, the same
  holds for provisions. A prop an action reads also records what the action
  catches: an argument with another class is refused at the application
  (R-f-6);
- **what a prop takes (MO-10f):** the fields of a prop that its type says hold
  or fail where they are read, so that a JS result with such fields may be
  given whole. Printed `query: takes(data pending fails(Error))`;
- **what it stores (O-3):** each prop it stores where the stored value outlives
  the component (in a source of its module, or through a provision above it),
  passing it on to a component that does included. A closure passed for one
  is checked at the application against that place. Printed
  `retains(onPick: module, onFocus: ./form.rx#fields)`;
- **where it applies a host (MO-11u):** `hosts(…)`.

The summary is exact for the checks it serves: a class escapes a set of paths
iff it is missing from the intersection of what the paths discharge.

`ref/check.ts --signature file.rx` prints a program's signatures, and that
text is the whole signature: it is read back in place of the module (MO-9).

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

- **MO-4a.** An `.rx` import's rows are its signature's. `import pure { f }`
  of an `f` that is `io` in the signature, and `fails A | B` on an `.rx`
  import, are `IMPORT_ROW_MISMATCH`: both assert rows at the JS boundary only
  (R-io-4, R-f-8, CN-5).
- **MO-4b.** Without `pure`, an `.rx` import is not `io` unless its signature
  says so: a pure `fn` from another module is callable in reactive scope.

## MO-5 — No cycles

- **MO-5.** Modules that import each other in a cycle are `MODULE_CYCLE`.
  Signatures are computed dependencies first; a cycle has no first.

## MO-6 — Names

- **MO-6a.** Importing a name a module does not export is `NOT_EXPORTED`; an
  `.rx` path that does not resolve is `MODULE_NOT_FOUND`.
- **MO-6b (Lexical across modules).** An imported component, `fn` or action
  resolves names where it was declared, never where it is applied (RG-7a). A
  binding carries its declaring region, and a component's region is owned at
  the application but resolves names from the declaration.
- **MO-6c.** An export is a declaration at the top level of a module. `export
  type T` is importable and binds no value: types are text to the checker
  (07 §2).

## MO-7 — Contexts across modules

- **MO-7.** A context is a declaration (RG-7a), so it crosses modules like any
  export: `export context who: string` in `ui.rx`, `import { who } from
  "./ui.rx"` and `provide who = …` in the module that renders `Badge`. Two
  modules that each declare `accent` declare two contexts, and a provision of
  one is not a provision of the other. A summary names the contexts it needs
  by declaration (`uses(ui.rx#who)`), checked above each place the component
  is applied. An exported context's type is its contract on both sides
  (RG-7e): a provider and a reader agree through the declaration.

## MO-8 — Declaration files for JS modules

- **MO-8a (The file and the row).** A JS module may have a declaration file
  beside it: for `./api`, `./api.js` or `./api.ts`, the file `./api.d.rx`.
  For `./x.mjs`, `.cjs`, `.jsx`, `.tsx`, `.mts`, `.cts`, the file's whole name
  first, `x.cjs.d.rx`, then `x.d.rx`; the first that exists is the
  declaration. It declares each export in rows, once, in the notation of an
  `.rx` signature:

  ```rx
  export pure fn fetchUser(id: number) rejects(NotFound | Offline)   // safe to call from reactive scope (R-io-4); its promise rejects with these (R-f-8)
  export fn saveUser(id: number, name: string) rejects(Offline)     // io: dirty is the default
  export error NotFound                                             // a JS class that is an error class (R-f-1)
  export type User = { id: number; name: string }
  ```

  `pure` is the only row word that lowers taint. `rejects(…)` absent is
  `Error`. An `error` row may list fields, which are sent to the client
  (SV-5a); its identity is its declaration. A file that begins `//@
  signature` is not a JS module's declaration (MO-13a).
- **MO-8b (The file is the row).** With a declaration, an import that names an
  undeclared export is `NOT_EXPORTED`; `pure` on the import must agree
  (`IMPORT_ROW_MISMATCH` for an io export); `fails` on the import is refused.
  Without one, a JS import is what R-io-4 and R-f-8 say: io unless `pure`,
  `fails(Error)` unless narrowed at the import. An export has **one row**: a
  second row of a name is a parse error, for a method's row (MO-8t) too. A
  row is an assertion, unchecked against the JS as `pure` is (CN-5), save
  where TypeScript (13 TY-6) or running (MO-8j) holds it.
- **MO-8c (The import stays).** A JS import, relative or a package's, stays an
  ES import in the compiled module, for the bundler to resolve. The one
  exception is `./api`, the app's injected API (`createApp({ api })`, CP-4).
- **MO-8d (Type parameters).** A declared fn, type or component may have
  TypeScript type parameters (`export pure fn defineRoute<const S extends
  string>(…)`, `component Picker<Option>(props: { … })`, `component
  Kit.Row<T>(…)`). They are TypeScript's text: the checker reads none of it.
  It reads the shape around types: `ref`, a function type and its word, `()
  => void`, `Promise<…>`, `View`, `Component`, a record's fields.
- **MO-8e (Optional parameters).** `ms?: number` on a declared fn: a call may
  leave a trailing argument out.
- **MO-8f (Pinned to a version).** `//@ for @tanstack/solid-query ^6.0.0` on a
  line of its own is a comment to the checker; `rx-tsc` refuses the
  declaration when the installed package, as each importer resolves it, is
  outside the range (`DECLARATION_VERSION`). Ranges: an exact version, `^`,
  `~`, `>=`, `>`, `<=`, `<`, joined by `||`.
- **MO-8g (Values).** `export const pageSearch: Schema` declares a value the
  module exports: imported, it is read as any import is, never io, and
  projected as `export declare const`.
- **MO-8h (Rest parameters).** `export pure fn pipe(...items: any[]): any`: a
  call passes any number of arguments after the fixed ones.
- **MO-8i (Where a word goes).** Every word sits by one rule, and the words are
  `.rx`'s own wherever `.rx` has the concept:

  | what the word describes | where it goes | words |
  | --- | --- | --- |
  | the kind of fn | before `fn` | `pure`, `server`, `client` (12 SF-5) |
  | a parameter | before its name, as in `.rx` | `ref`, `...` (rest); `draft` on one the fn changes in place, and on a callback's parameter (MO-10i) |
  | a value read | before its type | `ref` (an accessor), with `pending` and `fails(E)` before it where the accessor waits or fails (MO-10l); `catches(E)` on a prop; `handler` on a function type (MO-10g) |
  | what calling it, or rendering it, does | after the signature | `rejects(E)`, `instantiates`, `uses(c)`, `provides(c)`, `nests(children in component)`, `renders(H)` (MO-11u), `shape(…)`, a component's `fails(E)` |
  | a pin | a comment line | `//@ for <package> <range>` |

  `rejects(E)` is what a returned promise rejects with, `fails(E)` what a
  render throws. A word is one only where it stands before a type or in the
  row's tail: inside a string literal (`"ref label"`) it is the type's text.
  A member component is named as written (`Dialog.Trigger`, MO-11q), a method
  by one step (MO-8t). A row written with a word of *Withdrawn rules* is
  refused by name, with what says it now.
- **MO-8j (Strict declarations).** A project may ask that each row be shown
  rather than trusted: `rx-tsc --rx-strict`, or `"reactivescript": { "strict":
  true }` in the tsconfig (its own, else that of the nearest one it extends).
  Every `fn`, `component`, `error` and `const` row of a declaration the
  program imports, and of a host declaration it is under (MO-14e), must then
  be recorded by `rx-verify --record` in `<name>.verified.json`; otherwise it
  is `UNVERIFIED_ROW` (13 TY-7).
  - *A row makes claims*, each under a name of its own, as the crate's parser
    lists them (`rxc serve`'s `rows`): `exists`; `pure`; `uses:c` and
    `provides:c` for each context named; `rejects`; `fields`; `fails`;
    `callbacks:<position>` for each function-typed parameter, record field or
    prop (one with no `handler` claims nothing of the library, and is not
    applicable); `draft`; `placement`; `through:<component>` for a host's import.
  - *A result is about one claim*, by that name, and is `held`, `mismatch`,
    `unverified` or not applicable. What is printed about no claim is no
    result and is never recorded. A claim no check answered is `unverified`.
  - *A row is verified* when every claim of it but `exists` is held or not
    applicable, `exists` is held, and none is a mismatch. The record is
    keyed by a hash of the row's text (every line it spans, comments left
    out, whitespace collapsed outside string literals) and carries the
    version of the checks and the inputs of the run (the library's version or
    the module's text, the probe); an edited row, or a record of other checks
    or inputs, no longer counts.
  - *Evidence is the claim's own.* `uses:c` needs a failure with no provider,
    a clean run under providers of every context named and, where several are
    named, a failure again with `c`'s alone taken away. `pure`, which running
    can refute and not establish, is held where the code proves it and no run
    refutes it. `rejects` is run under failing arguments. A `ref` part answers
    alike when read twice, and one that is `pending` is seen to wait. `provides:c`
    holds for what is made under the component later, too. What a run holds is
    run again over the module changed so that the claim is false, and must not
    hold there.
- **MO-8k (Where a package's declaration is found).** The first of these that
  exists:
  1. the project's, `rx-types/<spec>.d.rx` in the importer's directory or one
     above it (a subpath is a folder);
  2. the package's own, beside the file the import resolves to (MO-10c); for a
     package written in `.rx`, a printed signature (MO-13);
  3. a shared one, `node_modules/@rx-types/<scope>__<name>/index.d.rx` (a
     subpath: `<subpath>.d.rx`);
  4. a generated one, `node_modules/.rx-types/<spec>.d.rx` (MO-8l).

  Solid's own is shared (`@rx-types/solid-js`). In `rx-tsc`, a package with no
  TypeScript types is typed by the declaration (TY-4b), and a project
  declaration is checked against the package's types where it has them
  (TY-6). With none of the four the import is what R-io-4 and R-f-8 say, and
  a component from it is `UNKNOWN_COMPONENT`.
- **MO-8l (Generated declarations).** A package with no declaration in the
  first three places gets one drafted by the tooling before the program is
  read, with a first line `//@ generated <package>@<version> …`, under
  `node_modules/.rx-types/` only. It is read as any declaration. It says no
  more than types show and code proves: every other fn is io, every other
  callback pure, every component given away cautiously placed (MO-11s). Under
  strict declarations no generated row is verified. `RX_GENERATE=0`, or
  `rx({ generate: false })`, turns it off. A draft is per installed copy.
- **MO-8m**, **MO-8o (A row's types are the library's).** A row's types are
  TypeScript's text, named where the library declares them; what the checker
  reads is MO-8d's shape.
  - A declared component's props may be **a type** in place of a record, or a
    type `&` a record that closes the props: `component Toggle(props:
    ToggleOptions & { onPressedChange?: handler (pressed: boolean) => void
    })`. The checker reads none of the type. Each field of the record is read
    as a record's field always is (MO-11a); a prop the record does not list is
    passed as any undeclared prop is (MO-11b).
  - *The record is held to the type* (13 TY-6f): each field names a prop the
    type has, and its type is one the library's type for that prop takes, the
    same or narrower. Otherwise `DECLARATION_MISMATCH`, on the row.
- **MO-8q (`any` is the library's, or it is not written).** A declaration of a
  module with types of its own may contain `any` only where the library's own
  declared type has `any` **at that position** (the parameter, the part of
  the result, the prop, the type argument), reproduced as it is. Any other is
  *introduced* and not allowed, drafted or hand-written. `unknown` stays
  `unknown`. A module with no types has none to inherit from: an `any` there
  is the author's. The benchmark holds it; no checker does.
- **MO-8r (What earns a word).** A word or a form is in the notation only if,
  without it, a correct Solid program that people commonly write cannot be
  written, or a mistake Solid programs really make cannot be refused, and
  that for more than one library (releases on npm that accept `solid-js ^2`,
  pre-releases included). No word carries one package's rule (CN-8). What a
  single package does is said without a word: by leaving the function
  undeclared, by a small module of the app's own JavaScript declared in the
  words there are (MO-10c), or by the library's own types (TY-4b).
- **MO-8s (A module of the app's own).** A relative JS module that stands over
  a library is declared like any, and drafted like any.
- **MO-8t (A method of a declared value).** `export fn toaster.show(…)` beside
  `export const toaster: …`, or beside `export fn toast(…)` for a function
  with methods, is a fn's row whose name takes one step, with every word a fn
  has. The call `toaster.show(x)` (written with `.`, not `?.`) is a call of
  the declared fn, and everything that is. `fn a.b.c(…)`, a row whose object
  the file does not declare a `const` or `fn`, and a second row of a method
  are refused.
  - *By scope.* The object is the import where the name resolves to it. Under
    a binding of the same name (a parameter, a local, a loop's variable) the
    member is that binding's. A nested *declaration* that shadows the import is
    MO-1d's.
  - *A compiled call* is the method called on its object, `this` kept.
  - *A method with no row* is read by the type of its object where a type is
    declared (MO-10b): one that answers nothing, or a promise, is io; one that
    answers a value is a read. A method written as a method (`navigate(to:
    string): Promise<void>`) is the field it is. A method of an io import (an
    undeclared one, or a declared `fn`) is io; of a `pure` import, pure.
- **MO-8u (A module's default export)** is the export named `default`:
  `export pure fn default(): ref boolean`, `export component default(props: …)`.
  It is imported under a name of the importer's, `import { default as Markdown
  } from "solid-marked/component"`, and that name is a component's by its
  capital (07 §4).
- **MO-8n**, **MO-8v**, **MO-8w (Words a tool writes).** `rx-declare` writes
  `pure`, `handler`, `draft`, `rejects(E)`, `uses(c)` and `provides(c)` into a
  draft only where the code an import resolves to proves them, and holds the
  words a file already has against the same reading (`--audit`: proven,
  contradicted, unproven). No word is written off a name, a shape, a run or a
  list of libraries (ruled 2026-11-24): `ref` is the types' own `Accessor`, or
  proven by the code, as `instantiates` is (the call makes what its owner keeps on every path that returns). Nothing in a checker knows where a word came from.
  What proves each, and what is refused, is in DECLARATIONS.md.

## MO-9 — A signature read in place of its module

- **MO-9a.** `import … from "./x.rx"` where there is no `x.rx` but an `x.d.rx`
  beside where it would be: the importer is checked against that file, read
  as `x.rx`'s signature. With both files the `.rx` is the module and the
  `.d.rx` is not read. With neither, `MODULE_NOT_FOUND`.
- **MO-9b.** The text is the signature, all of it; its first line, `//@
  signature x.rx …`, says that it is one. An importer checked against it gets
  the verdicts it gets against the body. Beyond MO-3's words a line carries:
  - a source's kind: `export source x … = …` asks a question (ST-5), `:= …`
    does not;
  - a fn's parameters (`ref`, with written types), `rejects(…)` (absent: it
    returns nothing that rejects) and `instantiates` (RG-6);
  - `export server fn f(a)` (12 SF-1; `server pure fn` when it is not io);
  - per prop: `catches(*)` where every class is discharged, `provides(…)` for
    children (RG-7b), `unrendered` for a prop only an action reads, and the
    action's name (`action go catches(…)`);
  - `uses(…)`: context keys relative to the module (`./ui.rx#who`), and
    `loading` for a reader of a client question that needs a `loading` above
    it (SV-7b);
  - `shape(…)`: what SV-7d needs where the component is applied: its roots,
    `closes-p`, `a`, `form`, and `children-at` chains;
  - MO-11u's rows: on a component, `hosts(./kit.d.rx#Toaster catches(E)
    provides(./theme.rx#theme); …)`, one entry for each place it applies H;
    of the module, `export hosts(…)` for the places it roots itself and
    `export renders ./kit.d.rx#Toaster from toast:12 fails(E) uses(…)
    hosts(…)` for each call that was given components. H is named by its
    declaration's path, relative to the module, as a context is;
  - `made` for a factory's component (MO-11j).
- **MO-9c.** A `.d.rx` carries rows, not code or types. The compiler binds an
  import's kinds from it (accessor, function, instantiating function, action,
  component) and imports the module's own compiled JavaScript beside it
  (`x.rx` → `x.mjs`); the types come from the `.d.ts` of the module's
  projection (13 TY-4c).

## MO-10 — Solid libraries

A Solid primitive is a JS function called once in an owner that hands back
accessors, setters and stores. Its declaration says so in the words a printed
signature already has. The call is the same JS call, placed where an
instantiation goes (RG-6a).

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

- **MO-10a (Instantiating JS functions).** A declared `fn` may end with
  `instantiates`. It is inferred when a parameter is `ref`, the return has a
  `ref` part, a function part of the result hands its callback a draft
  (MO-10i), the fn `uses(c)` (MO-12b), its result is `Component` (MO-11f), or
  it is `pure` and `renders(H)` (MO-11u); it is written only for a primitive
  with none of these. A call is an instantiation (RG-6): once, in the caller's
  region, never re-evaluated. It must be bound (`INSTANTIATION_NOT_BOUND`).
  Value arguments are snapshots (E-10); a `ref` argument is passed as an
  accessor `() => e` (RG-6b), a reader as it is, a constant as `() => c` with
  no node. A primitive is declared `pure fn`: making it writes no reactive
  state but its own.
  *An owner of its own.* The call is made in an owner of its own under the
  place it is written (`__rt.inst`, Solid's `createOwner`), outside tracking.
  To the place it is one child, on the server and in the browser, whatever it
  makes inside. Its cleanups run when the region goes (the primitives', last
  made first, before the region's own); an error thrown while it is made is
  thrown where the call is written, and one thrown later reaches the same
  `errored` region.
- **MO-10b (What the result is).** The return says what `.rx` sees:
  - `ref T` is a *reader*. Bound by destructuring or projection it is an
    equation of `T`, read without a call. Passed to a `ref` parameter, the
    accessor is passed as it is. `.rx` has no accessor type: `ref` is the one
    word for an accessor at the boundary, in either direction.
  - A function type **bound by a name** is io (R-io-3): callable only in
    imperative scope. A function field **read off a result where it is
    called** is told apart by what its type answers: nothing, or any promise,
    is io, `IO_IN_REACTIVE` in reactive scope and as a handler attribute's
    value (a promise *awaited* is a question asked, and allowed; a promise of
    nothing is not); a value is a read, called anywhere.
  - *The same evidence wherever a type is declared:* a component's props type,
    a context's type (02 SC-4), a declared value's (MO-8t). The code is
    `IO_IN_REACTIVE`, except where every provision the module writes gives
    that field of a context a name declared by `action`:
    `ACTION_CALLED_IN_OWNED_SCOPE`.
  - Anything else, a store or a plain value, is a value. A store's fields
    track at run time. A store passed in is passed as itself; an `.rx`
    structured source is a store behind a signal slot (11), so a value
    parameter misses a whole write: `SNAPSHOT_ARGUMENT` stands.
  - A record or tuple none of whose parts is an accessor is the library's own
    object; one with a `ref` part is wrapped, to call the accessor where the
    part is read. Only the return and its tuple or object parts, one level,
    are declared; an accessor nested deeper is a value.
  - TypeScript's `readonly` is a modifier: `readonly [ref T, …]` is a tuple
    and `{ readonly width: number }` has the field `width`.
- **MO-10c (Where a package's declaration is).** Beside the file the import
  resolves to with the build's conditions: `dist/index.jsx` has
  `dist/index.d.rx`. No export condition is needed. A subpath matched by `*`
  patterns takes the pattern Node takes (`PATTERN_KEY_COMPARE`). A package
  whose conditions resolve to more than one file ships the declaration beside
  each, with the same rows. A package that ships none is MO-8k's; a local
  module that re-exports it, with its own declaration beside it (MO-8a),
  always works. With no declaration, `import pure` of a primitive is
  unchecked (CN-5): the call is lifted (E-9) and re-runs whenever an argument
  changes.
- **MO-10d (Holds).** Solid promises nothing about an accessor: any read can
  hold. A reader bound from a `ref` result is checked as a reader of a
  question (ST-5): `pending?`, `latest` and `loading` apply, and its hold is
  visible where it is bound. No declaration can say an accessor never holds;
  MO-10l says that one does. A plain `ref` asks for no region.
- **MO-10e (What stays the library's).** A call to a foreign setter is not a
  write of a source: O-4 and AC-1 see only `.rx` sources. A read of `isOn`
  after `setOn(v)` in the same action reads the value before the write, under
  Solid's batching, and AC-1d cannot say so.
- **MO-10f (A prop whose fields hold or fail).** An `.rx` component may say in
  a prop's type which fields hold or fail where they are read: `props: {
  query: { data: pending fails(Error) Todo[]; status: string } }`, at any
  depth of record fields. (A declared JS result's plain field may not: MO-8r
  withdrew it, and both parsers refuse it by name. It is MO-10l's `ref` part,
  or a module of the app's own that hands the field out so.)
  - *A read of the field*, `props.query.data`, is checked as a question's
    reader is: it carries `pending` (`pending?`, `latest`, `loading`; CN-3d
    asks for a `loading` above it in a client-only build) and fails with the
    named classes (R-f-5). A nested field's rows are kept by its path. `q["data"]`
    with a literal key is `q.data`; a key the checker cannot name may be any
    field at that depth, and the read has every such field's rows combined.
  - *It is read a field at a time.* The result is not a value the program
    holds. Its name, and a path to a record of held fields, stand only where
    a field is read from them, where an equation gives them another name
    (`q = orig`, `r = q.result`), where the rest of a destructuring names
    every held field beside it, and where they are compared or tested.
    Anywhere else (passed, returned, provided, exported, written, spread, put
    in a literal, shown) is `RESULT_AS_VALUE`.
  - *Its operations are its declared fields.* A member read from it that its
    type does not declare (`valueOf`, `toJSON`, a field left out), or a call
    through a key the checker cannot name, is `RESULT_AS_VALUE`. A declared
    function field is called.
  - *Given whole*, a result or a record of held fields below one goes only to
    a prop whose type marks every field it holds or fails with at least as
    its declaration does (`Error` covers every class); the summary says
    `takes(…)`. Anything less is `RESULT_AS_VALUE`. The row words are dropped
    from the type TypeScript sees (13 TY-1c).
  - A row word where no record field takes it (a tuple's part, a union's
    member, a type argument) is `PARSE`.
  - *Guarantee:* in a program the checker accepts, a held field is read only
    by a path written from a name bound to the result, or from a prop whose
    type declares it held, and each such read is checked where it is.
- **MO-10l (Accessors that wait or fail).** A `ref` part of a declared result
  may have `pending` and `fails(…)` before its `ref`:

  ```rx
  export pure fn createJson(url: string): pending fails(Error) ref User                               // the whole result
  export pure fn createGeolocation(): [pending fails(Error) ref Coordinates, () => void]             // an item of its tuple
  export pure fn useQuery(ref o: Options): { data: pending fails(Error) ref T; isFetching: ref boolean; refetch: () => void }   // a field of its record
  ```

  A reader bound from such a part is checked as a question's reader is
  (ST-5): CN-3d, and a `catch` or `errored` above each read (R-f-5); its rows
  travel as a question's do. Either word may stand alone. They stand before a
  `ref` part, where MO-10b reads one (the whole result, a tuple's item, a
  record's field, one level), and nowhere else: before a plain field, deeper,
  in a function type's own result or on a parameter they are refused by name.
  A record or tuple with such a part is read a part at a time, by MO-10f's
  rule (`RESULT_AS_VALUE`); the part itself goes anywhere a value goes. A
  declaration may say less than the library does (13 TY-6b).
- **MO-10g (Callbacks).** A declaration marks a function type `handler` where
  the library calls it later, outside any computation, as the DOM calls an
  event handler: on a parameter, a field of a record parameter, or a declared
  component's prop (`useMutation(ref options: { onSuccess?: handler () =>
  void })`). A closure written there, in the call's arguments, is imperative
  scope (W-1, IO-2) and no part of the call's value. Everywhere else a closure
  made in reactive scope is pure (SC-3), and a statement-bodied one is
  `REACTIVE_WRITE_IN_OWNED_SCOPE`: a function type without the word is the
  pure function that is safe however the library calls it.
  On a declared component, a prop typed as a function is what the declaration
  says, whatever its name. The name's reading (SC-4, `on…`) is kept for a prop
  the declaration does not type as a function or does not name, for `.rx`
  components and for elements. `ref` is a handler on an element (07 §4),
  whatever it is passed; on a component it is a prop as any other.
- **MO-10i (A library's drafts).** Some libraries hand a callback a value to
  change in place (Solid's store setter). A declaration marks that callback's
  parameter `draft`, on a fn's parameter or on a function part of its result:
  `(update: (draft state: T) => T | void) => void`. In the closure a path of
  it is written with `:=` (ST-3), an updater included (W-6, its place
  evaluated once); the draft itself is not reassigned, and the callback
  returns a new value instead. Every other path write stays
  `WRITE_TO_NON_SOURCE`. `draft` says the library hands out plain data:
  arrays, plain objects, Maps, Sets. **A draft is a place, not a value:**
  1. *Its name stands only in its own callback.* A closure made inside may run
     later, so it may not name the draft (`DRAFT_ESCAPES`), but for a path's
     updater, applied where it is written. The callback has no `await`. A turn
     of `for (const t of d.items)` is a place of the draft.
  2. *A read of it is a copy.* Wherever a draft, a path below it or what a
     method called on one answers is read as a value, the compiled code copies
     it (`__rt.copy`: arrays, plain objects, Maps and Sets through, an
     iterator run to its end; a primitive, a function, a Date and a class's
     instance as they are). Not copied: what goes straight back to the library
     (a value written to a path, the callback's result, an argument of the
     draft's own method), and what an operator makes a primitive of. A local
     bound to a read is a copy, so its paths are not written
     (`WRITE_TO_NON_SOURCE`).
  3. *The function that hands it is called by its own name, with the callback
     written in the call.* That name is not passed, stored or renamed; a
     result holding one is read a part at a time. The argument is a closure
     literal, or a *named callback*: a closure bound by an equation or local
     whose name, **by its binding** (a sibling's local of the same name is
     another), is written only as that argument of such calls. Every other use
     of a draft callback's name is `DRAFT_ESCAPES`.
  4. *What is called on a draft is a method of plain data, by name:*

     | methods | what the call is |
     | --- | --- |
     | `push` `pop` `shift` `unshift` `splice` `reverse` `fill` `copyWithin` `set` `add` `delete` `clear` | a write of the draft: its arguments go to the library as they are |
     | `includes` `indexOf` `lastIndexOf` `at` `slice` `concat` `join` `flat` `with` `toReversed` `toSpliced` `get` `has` `valueOf` `toString` `toLocaleString` `hasOwnProperty`, and a string's or a number's (`trim`, `split`, `toFixed`, …) | a read: what it answers is a copy where it is kept |
     | `keys` `values` `entries` | a read whose answer is an iterator: kept, it is run to its end, over copies |
     | `forEach` `map` `filter` `find` `findIndex` `findLast` `findLastIndex` `some` `every` `flatMap` `reduce` `reduceRight` `sort` `toSorted` | calls the closure written in the call, now; its parameters are places of the draft, with rules 1 and 2 |

     Any other method, a method named by a key the checker cannot read, and a
     function made elsewhere given to one that calls it are `DRAFT_ESCAPES`.

  **A draft given to JS.** A fn's parameter may be declared `draft`: `export
  fn moveItem(draft list: T[], from: number, to: number): void` changes it in
  place during the call and keeps nothing. A draft's path is given to it as it
  is, and the call is a write of the draft. It may be given a draft or a value
  the code made itself; a source's value, an equation's, a prop, a provision
  and a store read beside its setter are `MUTATION_IN_PLACE` (02 W-1a). Such a
  fn is not `pure` (a parse error). A parameter not marked is lent a copy
  (`__rt.lend`), which in a development build (Solid's `DEV`) refuses to be
  changed, naming the fn.
  *Guarantee:* no value `.rx` holds after the callback returns is the
  library's draft or a live part of it, and no `.rx` code names it then.
- **MO-10k (Confined values).** The rules that keep a value where the checker
  sees what is done with it are local and syntactic:
  - *A place is not a value:* a draft (MO-10i) and a result with held fields
    (MO-10f, MO-10l) are restricted by where their name is written.
  - *By mention:* an instance a primitive made (E-10, E-5a) **may be, or hold
    a part of,** an expression that mentions its name or a name bound to such
    an expression: an equation's or local's value, a destructured part, the
    list a `for` row or loop variable goes through, an effect's `$n`, a
    parameter of a closure handed it in the same call or of a fn, action or
    named closure of this module called with it, what such a fn returns. A
    mention does not count where what is written cannot be handed on: an
    operand of an operator that makes a primitive, a template, a condition, a
    key, the argument of `len`, `str`, `sum`, `every` or `indexOf`; a closure
    gives what it returns. Where what is written names one slot of a literal,
    to that slot alone. A call's result may be anything it was given.
  - *Names, not runs:* a name is followed to the expression it is bound to, a
    parameter to the arguments its calls pass, a call to what its body may
    return. Each step over-approximates; none reads a type or runs anything.
  - *A closed set of operations for each kind.* A result with held fields:
    read a declared field, call a declared function field, another name,
    compare, test (else `RESULT_AS_VALUE`). A draft: MO-10i's (else
    `DRAFT_ESCAPES`). An instance: name it, pass it whole; a read of what may
    change, a method's answer included, is `SNAPSHOT_ARGUMENT` or
    `SNAPSHOT_KEPT` (`peek` says the read is once).
  - The declared type is read as text, a step at a time: a field of a record,
    what a function answers, an element of an array. A type the text does not
    spell out says nothing, and the strict reading stands; a part declared a
    primitive (`title: string`) holds no part of the value.
  - *The JS boundary:* a `pure` fn keeps nothing and hands what it is given
    back only as its result; an io fn, a method, and anything the checker
    cannot name may keep it. Nothing about JS is inferred.

## MO-11 — Solid components and routers

A Solid component is a JS function from props to a view. Its declaration says
so, and `.rx` applies it as it applies its own. A JS function may also hand
back a component, and either may take components as values where the
declaration asks for them. Nothing is added at run time.

```rx
// router.d.rx, beside ./router.js
export context router
export type RouteDefinition = { path?: string; component?: Component; children?: RouteDefinition[] }
export pure fn createRouter(config: { routes: RouteDefinition[] }): Component provides(router) nests(children in component)
export pure fn useParams(): Record<string, string> uses(router)
```

```rx
import { createRouter, useParams } from "./router.js"
import { fetchPerson, NotFound } from "./people.js"

component Layout(props) {
  <nav><a href="/people/1">Ann</a></nav>
  <main>{props.children}</main>
}
component Person() {
  params = useParams()                      // once, in the page's region (MO-10a); params.id tracks
  person = await fetchPerson(params.id)     // asked again when the param changes
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <h1>{person.name}</h1> }
  }
}
Router = createRouter({ routes: [{ path: "/", component: Layout, children: [{ path: "/people/:id", component: Person }] }] })

export default component App() {
  <Router />
}
```

- **MO-11a (Declared components).** `export component Link(props: { href:
  string; children?: View })`. Each field is a TypeScript type (TY-4b):
  `View` for a view (07 §6), `Component` or `Component<P>` for a component
  value (MO-11c). A field may start with `catches(…)`, what the component
  discharges for it (MO-3). `readonly` before a field is TypeScript's modifier
  and no part of its name. After the props, `fails(…)` says what escapes its
  root and `shape(…)` what SV-7d needs; absent, each is empty. With no
  children the application lowers to JSX's `<X />`, with no `children` prop.
  A JS import applied without a declaration is `UNKNOWN_COMPONENT`.
- **MO-11b (What the checks see).** A declared component is one step of the
  static application tree, with its declaration as its summary: an argument's
  failures, and its children's (RG-4c), continue at the application unless
  the field `catches` them, an undeclared prop's included. What its own body
  reads is outside the graph (CN-3b): its pending is not seen, and its
  failures only where `fails(…)` names them.
- **MO-11c (Components as values).** A component named with a capital as its
  tag would be, declared here or imported, may be
  - the value of a JS component's prop whose declared type is `Component`,
    alone or in a union;
  - anywhere inside the record and array literals given to a prop whose
    declared type **holds** a `Component` (a field of a record, an element of
    an array or tuple, the last argument of `Record`, `Array`, `Partial`,
    `Readonly`, `Required`, at any depth, never inside a function type);
  - anywhere inside the literals of a factory's arguments (MO-11f), or of a JS
    fn's (MO-11s, MO-11u).

  Elsewhere it is `COMPONENT_AS_VALUE`: `.rx` has no way to apply a value. It
  is checked as applied there, with no arguments, among the application's
  children (for a factory, of every application of the made component): what
  escapes it, the provisions it uses, its first load (CN-3d) and its content
  model (SV-7d), on every path, whether or not the library renders it. Its
  props are the library's and carry no rows.
  *The literal by a name.* An equation whose right side is a record or array
  literal with components in it is read as that literal where its name is the
  whole value of a prop that holds components, on one condition: **every
  mention of the name is such a prop.** A mention is the name's by its scope
  (another binding of the spelling, in a sibling component or a loop, is
  another name); one the checker does not resolve as such a prop (a callee, a
  path, an argument, a spread, another equation), none at all, or an export
  makes the binding `COMPONENT_AS_VALUE`, with which it was. A computed
  expression is no literal. A factory's and a fn's arguments keep the literal
  at the call.
- **MO-11d (Hooks)** are MO-10's primitives, called once in the component's
  region. One called with no provider above throws at run time, unless its
  declaration names its context: then it is `CONTEXT_NOT_FOUND` (MO-12).
- **MO-11e (Route data)** is an `await` equation over the route's params, in
  its component. A change of `params.id` is a new question, held as any
  re-ask is (H-2). A route's `preload` is a closure handed to JS (MO-10e).
- **MO-11f (Component factories).** A JS fn whose declared result is
  `Component` hands back a component. Its call is an instantiation (MO-10a),
  bound once, and the bound name is a component, applied in a view and never
  read as a value. For SV-7d the made component has no element of its own.
- **MO-11g (JS calls inside a factory's arguments).** A call, among a
  factory's argument literals, of a JS fn that is `pure` and makes nothing
  hands its arguments on: the components in them are values there too. An io
  fn, or one that instantiates, may keep or render what it is given, so its
  components take the cautious placement (MO-11s) wherever it is written; so
  do those of any such call bound on its own.
- **MO-11h (Typed params).** A page declares the params it reads as a prop.
  Whether a route's path supplies them is TypeScript's question, asked by the
  library's types where the table is written (MO-8d, TY-1d). The checker
  learns nothing of path syntax.
- **MO-11i (Nested values).** `nests(kids in inside)` on a fn that hands back
  a `Component`: the component at a record's `inside` field renders the
  entries under its `kids` field among its own children. The checker applies
  that record's component with the nested values as its children, so a
  layout's `errored`, `loading` and `provide` above `props.children` reach its
  routes, and its content model holds them. Sibling records stay siblings. A
  component given children this way that renders none (no `{props.children}`;
  in a host's view, no component the host renders through either, MO-14f) is
  `NESTED_NOT_RENDERED`. On a fn that hands back no `Component` it is a parse
  error.
- **MO-11j (An exported factory's component).** `export Router =
  createRouter({ … })` has the signature of a component whose view is `<Router
  />` in the making module: `export component Router(props: {}) made
  fails(Error) uses(./theme.rx#theme) shape(roots h1)`. `made` says it is a JS
  component: an importer applies it as JSX's `<X />`, with no `children` prop.
  It is exported as the component it is, not an accessor (CP-4b).
- **MO-11k (Render props).** A declared component whose `children` field is
  typed as a function giving a `View` (`children: (item: T, index: number) =>
  View`) takes a view lambda as the application's only child:
  `<VirtualList items={rows}>{view (row, i) { … }}</VirtualList>`. Its
  parameters are values; its body is a reactive block, declarations then a
  view, owned where the component calls it, and checked as the application's
  children. Other children of such a component are `VIEW_FN_EXPECTED`; one
  marked optional may be left out. A render prop under another name is a named
  view lambda among the children, `{view header (n) { … }}`. A view lambda
  anywhere else, or naming a prop not so typed, is `VIEW_FN_MISPLACED`.
- **MO-11m (A made component's properties).** `Router.paths` is a value read in
  the module that made the component, and may be exported. The component
  itself stays one, applied and never a value.
- **MO-11q (Compound components).** A `.d.rx` declares each member of a JS
  object by its written name, `export component Dialog.Trigger(props: { … })
  uses(dialog)`. `import { Dialog }` binds each declared member as a component
  named as written (an alias renames the head), and `Dialog` itself as the
  component it is declared, else as a value. A member not declared is
  `UNKNOWN_COMPONENT`. An object exported under a lowercase name is imported
  under a capital to be applied: a tag that begins with a small letter and has
  a `.` is `UNKNOWN_COMPONENT` when its head is a name of the module or it has
  no `-`.
- **MO-11r (Placement).** A component a program gives a library is a value from
  the literal it is written in until the place the library renders it, and is
  checked once, as applied, **at that place**, under the boundaries, providers
  and content model there. Where that is, one table says; it is the whole of
  the placement vocabulary:

  | the component is | it is checked | rule |
  | --- | --- | --- |
  | a prop typed `Component`, or in a prop that holds one | among that application's children | MO-11c, DV-24 |
  | by name, in a prop typed `View` | the same | MO-11t |
  | a view lambda, for a prop typed as a function giving a view | the same, with its parameters | MO-11k |
  | in the arguments of a fn handing back a `Component` | inside the made component, where that is applied | MO-11f |
  | … in a record of one that `nests(children in component)` | each entry among its parent's component's children, there | MO-11i |
  | in the arguments of a fn that `renders(H)` | among H's children, at every application of H | MO-11u |
  | … and placed by the host declaration that renders through H | where the host's view places it | MO-14h |
  | in the arguments of a fn with no word, or of an undeclared one | under a root of its own, with nothing above | MO-11s |
  | named by a host declaration's view | where the view says | MO-14 |

- **MO-11s (The cautious placement).** A component given to a JS fn that says
  nothing of where it renders it (through record and array literals and the JS
  calls among them) is checked as applied under a root of its own, at the
  call, with no `errored`, `loading` or `provide` above it. It is the right
  reading of a library that mounts what it is given under its own root, and
  less than any owner gives. It does not cover a library that calls the
  component with *no owner at all*: no row describes that, and a declaration
  is not to say of such a fn that it takes a component. The content model is
  not checked against a parent it cannot know.
- **MO-11t (An element in a prop).** A prop of a declared JS component whose
  type is `View`, alone, optional or beside values (`string | View`), that is
  not `children`, a function giving a view (MO-11k) or a `Component`, takes a
  component by its name: `fallback={Empty}` is JSX's `fallback={<Empty />}`,
  applied with no arguments where the library reads the prop, and checked as
  MO-11c checks a component value. Only a name bound to a component, written
  alone: a computed one, a member and a call are `COMPONENT_AS_VALUE`. A view
  prop still takes a value that is a view (a string). An undeclared prop takes
  none.
- **MO-11u (Components a library renders beneath a component of its own).**
  `renders(H)` after a declared fn's signature names a component H the same
  file declares (a member by its written name): every component among the fn's
  arguments, found as MO-11s finds them, is rendered later, any number of
  times, *beneath an application of H*.

  ```rx
  export component Toaster(props: ToasterProps)
  export fn toast(message: View | (() => View), data?: ExternalToast): string | number renders(Toaster)
  export pure fn createRoute(options: RouteOptions): Route renders(RouterProvider)
  ```

  *What is checked.* Each such component, as applied with no arguments among
  H's children, at **every** place the program applies H: what H `provides`
  and what is above that place reach it, and H's own `uses` is credited too
  (what H reads is above H). What it lets out of all of that is the program's
  error, on the line of the call: `CONTEXT_NOT_FOUND`, `UNHANDLED_FAILURE`,
  `CLIENT_QUESTION_UNHELD` or `ASYNC_OUTSIDE_LOADING_BOUNDARY`. The content
  model is not checked against H.
  *No application in the program:* it is held to what H `uses` and `provides`,
  under a root of its own.
  *Across modules* the judgment is the program's, from signatures: a call is a
  row of its module (`export renders … from toast:7 …`, H's own `uses` and
  `provides` taken off); a component that applies H says where (`hosts(…)`:
  what is discharged and provided between H's children there and its root),
  and one that applies such a component carries its places on; the module's
  own `export hosts(…)` is for places it roots itself. The program's places
  are every module's own row and the components a JS host applies (CP-4d). A
  component given to such a fn that itself applies a host is a place wherever
  its own host renders it, composed to a fixed point. A module read by its
  signature (MO-9) is judged as its source is.
  *What the word does to the row.* Nothing else; a `pure` fn that says it is a
  constructor, so `instantiates` is inferred. On a fn that hands back a
  `Component`, and where the file declares no component H, it is `PARSE`.
  Siblings are placed side by side: a layout's regions are not credited to
  another page (MO-11i or MO-14 is what does that). No value is followed to H.
- **DV-24 (a component value is owned at its application).** Solid lets a
  library render a component value anywhere. MO-11c's check assumes it is
  rendered beneath the owner of the application it was passed to. A library
  that renders one under a root of its own escapes it (CN-3b), and Solid's
  run-time errors stand there. It is a claim of the component's row
  (`placement`), which `rx-verify` runs.

## MO-12 — JS contexts

A Solid library keeps its session state in a context: its hooks read it and
one of its components provides it. The words are the ones `.rx` contexts have
(RG-7b). Nothing is added at run time.

- **MO-12a (Declared).** `export context c` in a JS module's `.d.rx` names a
  context the JavaScript owns. It is named only by that file's `uses(…)` and
  `provides(…)`: it is not importable, and `.rx` cannot `use` or `provide` it.
  Its key is the declaration file's (`./router.d.rx#router`, MO-7). A word
  naming a context the file does not declare is `NOT_EXPORTED`.
- **MO-12b (Uses).** `uses(c)` on a fn: each call is a `use` of `c` where it is
  written, checked by RG-7b over the static application tree, through
  signatures. A fn that uses a context instantiates (MO-10a). On a declared
  component it is what the component itself needs from above.
- **MO-12c (Provides).** `provides(c)` on a declared component provides `c` to
  everything it renders: its children and every prop. On a fn that hands back
  a `Component`, the made component provides it to the components the call was
  given. On any other fn it is a parse error.
- **MO-12d (Provider order).** A provider that needs another above it says so
  with `uses(…)`; nested wrongly it is `CONTEXT_NOT_FOUND` like any use.
- **MO-12e (A context of another module).** `export context c from "<module>"`
  names the context `c` that the declaration of `<module>` declares, found as
  an import written in this file would be (MO-8a, MO-8k), under that
  declaration's key, followed through a module that takes it in turn. A name
  it does not declare, a module with no declaration, and a compiled `.rx`
  module are `NOT_EXPORTED`.

## MO-13 — Packages written in `.rx`

A library written in `.rx` is used by an `.rx` app, which is checked against
it as against a local module, and by a JavaScript or TypeScript Solid 2 app,
to which it is an ordinary Solid library. One build serves both. Its `.d.rx`
is the signature the compiler printed.

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

- **MO-13a (The marker).** A `.d.rx` with a line `//@ signature <module>.rx …`
  before its first row (blank lines and comments alone may come before it) is
  the printed signature of a compiled `.rx` module. Wherever a JS import finds
  it as its declaration (MO-8a, MO-8k), it is read as MO-9b reads a signature,
  and the import is an `.rx` import in everything but its specifier: it
  resolves to the module the signature stands for (the path with `.rx` for
  `.d.rx`), known by its signature only. The compiler writes the marker on
  every signature it prints.
- **MO-13b (What the marker switches).** Every way the two notations differ,
  decided by the marker and by nothing else:

  | | a printed signature (marked; MO-9b) | a JS module's declaration (MO-8) |
  | --- | --- | --- |
  | `rejects(…)` absent on a fn | the fn returns nothing that rejects | `rejects(Error)` |
  | a fn's purity | `pure fn`, with `io` among its rows (`: io pending`) | `pure fn` is pure, `fn` is io |
  | `export source x … = …` / `:= …`, `export x: pending fails(E)` | a reactive name, read-only to the importer, with its rows; `=` a question, `:=` not | no such row: a JS value is `export const x: T`, never reactive |
  | `export action f` | an action: io, it never fails, `ACTION_CALLED_IN_OWNED_SCOPE` where called in reactive scope | no such row |
  | `export server fn f(a)` | a server function (12 SF-1), `server pure fn` when it is not io | `server` is a side: a JS function that exists on the server only (12 SF-5) |
  | `export error C(a, b)` | an `.rx` error class with its constructor's parameters | a JS class, with the fields sent to the client (SV-5a) |
  | `export context c: T = …` | an `.rx` context: importable, `use`d and `provide`d by the importer, with `source`, rows and whether it has a default | a context the JavaScript owns (MO-12a) |
  | `uses(…)`, `provides(…)`, `retains(…)` | context *keys*, relative to the signature's own module, of any module; `uses(loading)` is SV-7b's need | names of contexts the same file declares |
  | a component's props | the summary of MO-3, a row per prop: bare (rendered, discharging nothing), `catches(E)` / `catches(*)`, `provides(…)` for children, `unrendered`, `action go catches(…)`, `takes(…)`; no types | TypeScript's fields, with the words of MO-8i on them |
  | after a component | `made`, `fails(E)`, `uses`, `retains(…)`, `hosts(…)`, `shape(roots …; closes-p; a; form; children-at …)` | `fails(E)`, `uses`, `provides`, `shape(T)` |
  | types | none: a row's types are the projection's, in the `.d.ts` beside it (MO-13d); `export type T` is a name | the row's text is the module's `.d.ts` (13 TY-4b) |
  | type parameters, optional and rest parameters, `handler`, `draft`, `nests`, `renders(H)`, `const` | not written | MO-8d to MO-8o, MO-10, MO-11 |
  | what it is held to | nothing: the compiler inferred each row (no TY-6, no MO-8f, no MO-8j) | TY-6, MO-8f, MO-8j |
  | the import's own rows | `import pure` cannot lower an io row and `fails` is refused, with MO-4a's messages | MO-8b |
  | what the name is bound to | the app's instance of the module (MO-1b): a source and an equation are accessors, an instantiating fn is called once where it is bound, an action is launched, a component is applied (MO-9c) | the JS module's export, as it is |
  | lines | one export per line | a row may span lines |

  A context key crosses the package boundary because it is relative: `uses(./theme.rx#theme)`
  in `dist/index.d.rx` is the key of the context `@demo/rates/theme` exports.
  A package ships the signature of every module its entries reach, at its
  place under the source root. `rx-lib` refuses a key (a context's, a host's)
  that names a file outside what the package ships, with the module and the
  key: such a package takes the value as a prop, or provides it itself.
- **MO-13c (The compiled module).** The import stays an ES import of the
  specifier written (MO-8c) of the module's factory, exported as `__rx`:
  `import { __rx as __m0 } from "@demo/rates"`, then `__rt.module(__m0,
  __m0)`, keyed by the factory itself, so the package's module is one module
  of the app however many import it.
- **MO-13d (Types).** The import is typed as an import of the `.rx` module the
  signature stands for: the projection (13 TY-1c) writes its path, and
  TypeScript finds `index.rx.d.ts` beside the signature.
- **MO-13e (The library build).** `rx-lib` (`rxc app --lib`) builds a package
  from its entries (`"reactivescript": { "entries": ["src/index.rx"] }`, or
  arguments): every module they reach is checked and compiled once for the
  browser (`dom`, hydratable) and once for the server (`ssr`), written with
  its signature and types at its place under the source root; scoped styles
  are `x.css`, which the browser's entry imports; the JavaScript modules it
  imports by relative paths are copied with their `.d.ts` and `.d.rx`. The
  package.json's `exports` are held to this map for each entry, and `rx-lib`
  fails, printing it, where they say anything else (`--write` writes it):

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

  Solid and the runtime are among its peers. There is no `solid` condition,
  and the `.d.rx` needs none (MO-10c). Both builds of a module make the same
  owners in the same order, so a package hydrates with an app compiled apart
  from it, given one copy of Solid and of the runtime.
- **MO-13f (The JavaScript boundary).** To JavaScript the module is a Solid 2
  library: a component is a component; a source or an equation is an accessor;
  a fn is a function, and one that instantiates takes each `ref` parameter as
  an accessor and hands back an accessor; an action is a function that returns
  a promise; an error class is called to make an instance, and `e instanceof
  C` holds. A context and a type are not values of that module; a server fn
  cannot be exported by a package (`rx-lib` refuses it). The exports are bound
  by the runtime's `library(factory, name)` to the page's app (MO-13g). A
  `.tsx` caller gets TypeScript's checks and no others.
- **MO-13g (One instance in a page).** A package's module has one instance in a
  page, on the server in a request, whoever imports it. JavaScript's use of a
  module (`library`, and CP-4d's `components`) is bound to *the page's app*:
  - *In the browser*, the first app made in the page. A program's
    `createApp` makes it; where JavaScript used a package first the runtime
    made it, and the first `createApp` after that returns that app.
  - *On the server*, inside a request event, the request's app, kept in the
    event's `locals`. Outside one, the *render's*: one app for each call of
    `renderToString` or `renderToStream`, kept by that render's identity and
    gone with it. Never the process's: an export used where nothing renders
    and no request is being answered throws, saying so.
  - *A request's state lives as the request does.* Its modules are under an
    owner no render owns. Each render of the request that uses the app holds
    it; when the last hold is gone it is released at the end of that turn of
    the event loop, and a use after that is refused. `holdRequest()` holds it
    by hand. Two requests never share.
  - *A second `createApp`* in one page is a second app, with instances of its
    own. JavaScript stays bound to the first; a host that wants another
    passes it (`components(pages, app)`).
- **MO-13h (A module's root, for JavaScript).** Where JavaScript's use is what
  first instantiates a module, it is made in a root of its own
  (`createRoot`) not owned by the place of that use: in the browser by no
  owner; on the server in a request under the request's owner, and outside
  one under the render's root owner. Its id is the module's name (written by
  `rx-lib` or the plugin), so its nodes' ids are the same on both sides
  whoever used it first. What this reads of Solid's internals is in
  `ref/compile/solid-internals.ts`, each read held against the public answer,
  with no fallback: a Solid shaped otherwise is refused.

## MO-14 — What a JS host renders: a host declaration

A file-based router finds its route files itself: JavaScript imports each
file's component and renders it under the router's provider, inside the layout
its file name puts it in. No `.rx` module applies those components, so a
**host declaration** says what the host does, in the words a factory's row
has. Without one, each is checked under a root of its own (11 CP-4d, MO-11s).

- **MO-14a (The file).** `host.d.rx`, in the folder of a program's entry or one
  above it (the nearest). It has two kinds of row besides MO-8's: imports of
  the `.rx` components the host renders, by name from a relative `.rx` module
  (a module's default component by its own name), and one view (MO-14b). It
  declares the contexts its view names (`export context router`, or MO-12e's
  form). An import from any other module names a component the host renders
  through (MO-14f).
- **MO-14b (The view).** `export default component provides(router)
  nests(children in component) = { component: Layout, children: [{ component:
  Home }, { component: Person }] }`, written once in a file. The words are a
  factory's (MO-11f, MO-11i, MO-12c); after `=`, the record or list of records
  the host renders, their components the names the file imports.
- **MO-14c (How it is checked).** As the app's view. The declaration stands for
  an entry module with its imports, `View = f(<tree>)` for an `f` declared
  `Component` with the row's words, and `<View />` as the default component,
  and the checker walks that module with the rules it has. What a page lets
  out is refused on the line of the view (`UNHANDLED_FAILURE`,
  `ASYNC_OUTSIDE_LOADING_BOUNDARY`, `CONTEXT_NOT_FOUND`), naming the reader's
  own place. It is checked whenever a program under the declaration is.
- **MO-14d (What it credits).** A component the view names is rendered where
  the view says, and is not checked under a root of its own. Any other
  component such a module exports is, in a whole-program build, as every
  export of a module a host renders. A component an `.rx` module applies
  itself is checked there too. A module the declaration imports has no mounted
  view. The view passes no props. What it does not name is not above its
  pages.
- **MO-14e (Kept true).** The declaration is trusted as every `.d.rx` is, and
  run as every one is: `rx-verify host.d.rx` renders the scene its probe gives
  and holds the view to it (`placement`, `provides:c`, `through:<component>`).
  In strict mode the view and each import from JavaScript must be recorded
  (`UNVERIFIED_ROW`), and what it imports from JavaScript is a declaration the
  program consumes, held to its pin, record and types as any other.
- **MO-14f (What the host renders through).** A component the declaration
  imports from JavaScript (any module that is not `.rx`, whose own declaration
  declares the name a component, else `NOT_EXPORTED`), applied in the view of
  an `.rx` component, renders **that component's children** there, as
  `{props.children}` written among its own children would. So the records
  nested in a component are checked where it applies the host's: under the
  regions and provisions around the application, and what the applied
  component's own row provides and requires. Applied twice, at both places.
  - *An `.rx` entry around the router* is named in the view, with the host's
    records as its children. Its default component is then at the top of the
    view, with nothing above it: what MO-1c's mount is.
  - *To any depth.* In a host's view an `.rx` component whose view applies a
    component the host renders through is itself one: applied in another's
    view, it renders that component's children where its own view applies the
    host's. The pages are under what both have around it, and against the
    elements open above it in both (SV-7d). Which components those are is read
    off the tags each view writes, a name declared inside that view left out;
    a module read by its printed signature is not followed. One that also
    reads its own `props.children` has the pages checked there too.
  - *A component that renders none* of the children its record gives it, by
    neither way, is `NESTED_NOT_RENDERED`. In a module checked outside the
    host's view such a component is the plain JS component its row declares.
- **MO-14g (Derived from the router's own tree).** `//@ routes <source>
  [<entry.rx>…]` before the file's first row says the file is that source's,
  written whole by `rx-declare --host --routes`. To the checkers it is a
  comment (CN-8). A declaration that has fallen behind its source is
  `HOST_VIEW_STALE`: the tools' diagnostic (`rx-tsc`, `rx-verify`, a build;
  the dev server writes the file again), no checker's. The sources are in
  DECLARATIONS.md.
- **MO-14h (A page given to a fn that `renders(H)`).** Where a program is under
  a host declaration, a component its view places, given to a fn declared
  `renders(H)`, is checked where the view places it, and not again side by
  side beneath H, **when the declaration says the host renders through H**
  (imports it, MO-14f). A component the view does not place, one given to a
  fn whose H the declaration does not import, and one given to a fn with no
  word keep their row's placement; a placed component applied by hand
  elsewhere is checked there too.

## Diagnostics this document adds

| code | bin | rule |
| --- | --- | --- |
| `TOP_LEVEL_MARKUP` | S | MO-1c |
| `SHADOWED_IMPORT` | S | MO-1d |
| `WRITE_TO_NON_SOURCE` | S | MO-2a; MO-10i for a path that is no draft's |
| `IMPORT_ROW_MISMATCH` | S | MO-4a, MO-8b |
| `MODULE_CYCLE` | S | MO-5 |
| `NOT_EXPORTED`, `MODULE_NOT_FOUND` | S | MO-6a, MO-9a; MO-8b (a declared JS module), MO-12a, MO-12e (a context), MO-14f (a host's import from JavaScript) |
| `IO_IN_REACTIVE`, `IO_IN_FN`, `ACTION_CALLED_IN_OWNED_SCOPE` on a JS call | S | MO-10b, MO-8t, MO-13b |
| `INSTANTIATION_NOT_BOUND`, `SNAPSHOT_ARGUMENT`, `SNAPSHOT_KEPT` on a primitive | S | MO-10a, MO-10b, MO-10k |
| `REACTIVE_WRITE_IN_OWNED_SCOPE` in an unmarked callback | S | MO-10g |
| `RESULT_AS_VALUE` | S | MO-10f, MO-10l |
| `DRAFT_ESCAPES`, `MUTATION_IN_PLACE` | S | MO-10i |
| `UNKNOWN_COMPONENT` | S | MO-8k, MO-11a, MO-11q |
| `COMPONENT_AS_VALUE` | S | MO-11c, MO-11t, MO-11f |
| `VIEW_FN_EXPECTED`, `VIEW_FN_MISPLACED` | S | MO-11k |
| `NESTED_NOT_RENDERED` | S | MO-11i, MO-14f |
| `CONTEXT_NOT_FOUND` | S | MO-7, RG-7b; MO-12b for a hook; MO-11s, MO-11u, MO-14c by placement |
| `UNHANDLED_FAILURE`, `ASYNC_OUTSIDE_LOADING_BOUNDARY`, `CLIENT_QUESTION_UNHELD` by placement | S | MO-10l, MO-11c, MO-11s, MO-11u, MO-14c |
| `PARSE` of a declaration | U | MO-8b (a second row), MO-8t, MO-10f, MO-10i (`pure` with `draft`), MO-11i, MO-11u, MO-12c, a withdrawn word |
| `DECLARATION_VERSION`, `DECLARATION_MISMATCH`, `UNVERIFIED_ROW`, `HOST_VIEW_STALE` | tools | MO-8f; MO-8o, 13 TY-6; MO-8j; MO-14g |

## Withdrawn rules

An ID here is refused by name in both parsers, or is no longer a form. The
rule as it was, why it was withdrawn and what it would take to return are in
the archive.

| ID | was | now |
| --- | --- | --- |
| **MO-8p** | several rows of one fn's name (overloads) | one row (MO-8b); a call is typed by the library's own overloads |
| **MO-10h** | `signal` on a parameter | a signal made in a module of the app's own (MO-10c) |
| **MO-10j** | `tracked` before a function type | no word: an unmarked function type is pure (MO-10g) |
| **MO-11l** | `renders` alone | no word (MO-11s), or `renders(H)` (MO-11u) |
| **MO-11n** | `renders(root, …)` | no word (MO-11s) |
| **MO-11o** | `renders(later)`, `carries`, a prop's `renders T`, `RENDERS_ESCAPES`, `keeps(…)` | a factory (MO-11f, MO-11i) or `renders(H)` |
| **MO-11p** | `nests(component under parent)`, `under(…)`, `outlet` | `nests(children in component)` (MO-11i), or a host declaration (MO-14f) |
| | `forwards` (MO-11g), `joins(…)` (MO-11i), `methods(…)`, `trusted` (MO-8j) | `pure`; the library's own types; `peek`; strict mode is a project's |
| | `pending` / `fails(E)` before a declared result's plain field (MO-10f) | before its `ref` part (MO-10l) |
| | `holds` on a field | `pending` |

## Rulings

Settled, in the order they were taken: file = module, and a module boundary is
a value boundary (07, 2026-10-22); contexts are declared (MO-7, 2026-10-23);
module state is a singleton per app, no import cycles, `.rx` rows are the
signature's, the `.d.rx` notation (2026-10-26). Taken by default and open to a
maintainer's veto: MO-1d, MO-9, MO-10, MO-11 and DV-24, MO-12, MO-13, MO-14.
Ruled since: MO-8q and MO-8r (2026-11-22; the settlement of the one-library
words, 2026-11-23), MO-10k (2026-11-22), MO-10l and MO-11t (2026-11-23),
MO-11u (2026-11-24), MO-8t and MO-8u (2026-11-25).

Executable: S-module-1 to S-module-43, S-app-shop, S-check-3; the units named
for each rule in `ref/units.ts` and `compiler/src/`; `bench/tasks` and
`bench/coverage`.
