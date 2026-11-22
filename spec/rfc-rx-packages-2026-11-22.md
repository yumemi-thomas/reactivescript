# Packages written in `.rx`: what landed, and what is still a proposal (2026-11-22)

A design note for 09 MO-13, 11 CP-4e and 13 TY-4c (extended). The gap it
closes: a package's shipped `.d.rx` was found (MO-8k, second place) and
read as a *JS module's* declaration (MO-8a), while what an `.rx` package
has to ship is its modules' *printed signatures* (MO-9b) — a notation with
other defaults and other rows. The first half says what was decided and
why; the second lists what was not done, each as a proposal.

## What landed

- **The marker** (MO-13a). `//@ signature <module>.rx …`, a pragma line
  before the first row. Chosen over a new keyword row (`signature of
  "./index.rx"`) because both parsers of rows, the tree-sitter grammar's
  extras and every tool that reads a `.d.rx` already take `//@ …` as a
  comment (`//@ for`, `//@ generated`), so a marked file is still a file
  an older tool opens; chosen over an export condition or a file name
  (`index.sig.rx`) because MO-8k and MO-10c find a declaration by one rule,
  beside the file the import resolves to, and the lookup should not grow a
  second one. The compiler writes it on every signature it prints, so no
  one adds it by hand, and the header comment it wrote before is gone.
- **One reading, not a merge.** A marked declaration is not parsed by the
  JS-declaration parser with other defaults: it is handed to the signature
  reader, and the import becomes an `.rx` import known by its signature
  (MO-9a). Every difference of MO-13b's table follows from that one switch,
  and MO-9b's guarantee — the verdicts against the text are the verdicts
  against the body — carries over unchanged. `bench/tasks/rx-package`
  holds it: the good app and each of nine mistakes get the same
  diagnostics on the same lines against the shipped `.d.rx` as against the
  package's `.rx` source, from both checkers.
- **Compiled modules, both targets, no sources for apps to compile**
  (MO-13e, with the reasons there). The export conditions are Solid's own
  (`worker`, `browser`, `deno`, `node`, `default`), without `solid`.
- **Two declaration files.** `x.rx.d.ts` is what TypeScript emits from the
  module's projection (TY-4c): a source is its value's type, as `.rx`
  reads it. `x.d.ts` is the truth about `x.js`: a source is an accessor.
  One file could not serve both readers, and the alternative — the `.rx`
  projection reading a JS-shaped declaration through the signature's rows,
  as TY-4b does for a JS module's `ref` results — would have put a second
  description of every kind of export into both projections. The `.d.ts`
  is written from the first by kind, with `typeof`, so no type is restated.
- **Hydration** needed no decision of the compiler's: keys are the
  runtime's owner ids (MO-13e). It is tested, for an `.rx` app and for a
  `.tsx` app.
- **One instance in a page, whoever imports** (MO-13g; items 4 and 5 of
  this list as it first stood). *What was true:* an `.rx` program and
  JavaScript that both imported a package had an instance each, in the
  browser and on the server — the program's app and a second one the
  runtime made for the host (`library`'s own `hostApp`; in a stream, an app
  under another key of the event's locals). A probe that instantiates the
  package's factory as compiled `.rx` does and then reads the package's
  JavaScript export counted two instantiations on each side; it counts
  one now (`bench/tasks/rx-package`, `mixed.mjs`). The first report's "one
  compiled module is one instance" was true of the *code* and of a page
  with one kind of importer, and false of the mixed page; the sentence in
  MO-13f that said so is gone. *The rule:* the page's app is the first
  app made in the page, and JavaScript is bound to it. The order does not
  matter: where JavaScript came first the runtime made that app, and the
  program's `createApp` returns it. Considered and not done: finding the
  app by position (Solid's context, through the owner), which is exact
  while a component renders and unavailable in its handlers — a page with
  two apps would then render one app's state and write the other's.
- **A plain render on the server** (MO-13g). `library` needed Solid's
  request event for one thing: somewhere to keep the app that is not the
  process, so two requests never share module state. A render has such a
  place without an event — its root owner, which Solid itself keeps a
  table of (`getRequestEvent`'s fallback finds a render's context by
  walking the owner's parents to it). The app outside a request is kept by
  that owner and dropped when it is disposed (owners are reused, so the
  entry must not outlive its render). The request event still wins where
  there is one, so a framework's server functions and its render share an
  app. What still throws is a use with neither: the message names both
  ways out.
- **A module's root** (MO-13h). The proposal here was to instantiate under
  the render's root owner. That alone does not fix what it was for: a root
  made there takes the root owner's next child id, which depends on when
  the first use happens just as much. And the text was wrong about
  disposal: Solid disposes a root made under an owner with that owner, so
  a module first read inside a component died with it (its question
  stopped answering; `runtime/test.mjs` holds the case). What landed: the
  root is owned by nothing in the browser and by the render's root owner
  on the server, and its id is given, not taken — the module's name, which
  `rx-lib` writes into the call. The `.tsx` app's hydration in the
  benchmark depends on it: with another id on one side Solid reports the
  `<Loading>` fallback it cannot find in the server's page.

## Still proposals

1. **A signature that names another package's context.** A context key in
   a printed signature is a path relative to the signature's module. Inside
   one package that is exact. Where package A's component `uses` a context
   package B exports, A's signature says `uses(../node_modules/b/dist/
   index.rx#theme)`, which is right only where B is installed beside A as
   it was when A was built (not under a hoisting, a workspace link, pnpm's
   store). *Proposed:* a key under `node_modules` is printed from the
   package's name (`b/dist/index.rx#theme`), and a package's modules are
   keyed that way when they are loaded — SV-5a's rule for a declared error
   class's identity (`packageRelative`). It changes what a key is for every
   package module in both checkers, and two installed versions of one
   package would then share a key the checker cannot tell apart, which
   SV-5a refuses for error classes; whether to refuse it here too is the
   open question. Until then `rx-lib` builds such a package and its
   signature is only right in the layout it was built in.
2. **Scoped styles.** A module's stylesheet is written (`x.css`) and
   exported (`"./index.css"`); nothing imports it. An app compiled by the
   Vite front end gets its own modules' styles linked by the plugin
   (CSS-4), and a package's are not part of that program. *Proposed:* the
   module an import resolves to imports its `.css` in the browser build
   (bundlers take it; Node does not, so not in the server build), or the
   signature carries the stylesheet's name and the app's build links it.
   The benchmark's package has no `<style>`.
3. **Server functions.** `rx-lib` refuses a package that exports one
   (MO-13f). A package could carry the function's body and leave the
   registration to the app: `export server fn` compiled to a plain async
   function plus a manifest row, and the app's build wrapping it in a
   server fn of its own module. That is a contract with Solid's
   `"use server"` pass that this repository does not own.
4. **What MO-13h leaves.** (a) A `?rx-lib` module (CP-4d's `components`)
   is still instantiated where it is first rendered: `components(pages)`
   is given no name to make a root's id from. *Proposed:* the plugin
   passes the module's path relative to the project, and `components`
   roots it as `library` does. (b) A dependency two packages share is
   instantiated inside the root of whichever module needed it first; its
   ids follow that module's, so two packages first used in another order
   on each side would number it differently. *Proposed:* `__rt.module`
   itself makes a named root for a module of a package, which changes the
   ids of every program and wants its own change. (c) The render's root
   owner is reached through `_parent` and Solid's table of render roots,
   both internal. Solid has no public "the root of this render"; asking
   for one is the right end of this.
5. **What MO-13g leaves.** (a) Two renders inside *one* request event
   share the request's app, and a module's nodes are under the first
   render's root: the second render reads nodes the first disposed. One
   render per request is what frameworks do; a per-render app inside a
   request would instead split a render from the server functions of its
   request. (b) Outside a request, an export used after an `await` in an
   async function has no owner, so it throws as a use outside any render:
   Solid's own owner-bound APIs have the same limit, and the request
   event (AsyncLocalStorage) is what carries across an `await`. (c) A
   second program in a page cannot ask for JavaScript's binding: there is
   no `createApp({ … , page: true })`. Nothing has needed it.
6. **A package's own JavaScript.** `rx-lib` copies the JS modules the
   `.rx` imports by relative paths, with their `.d.ts` and `.d.rx`, and
   what they import beside them; it does not build TypeScript, bundle, or
   write a `.d.ts` for a JS module that is typed only by its `.d.rx`
   (TY-4b's virtual file is rx-tsc's, so a `.tsx` app would see `any`
   through it). A package with such modules builds them first.
7. **Strict declarations and a marked file a person edited.** A printed
   signature is exempt from MO-8j and TY-6 because the compiler wrote it.
   Nothing proves that: a person can write the marker over any rows.
   *Proposed:* the marker line carries a hash of the rows and of the
   compiled module beside it, which strict mode checks — the same shape
   as MO-8l's `types <hash>` on a generated declaration.
8. **`rx-lib` as `rxc lib`.** The build is a Node script because the
   projections' declarations are TypeScript's to emit. The crate's part
   is `rxc app --lib`; a native `rxc lib` could write everything but
   `x.rx.d.ts`.
9. **The language server on a package's `.d.rx`.** tree-sitter reads a
   printed signature; the Volar plugin gives a `.d.rx` an empty module, as
   it does a JS declaration, so there is no hover on a signature's rows.
   Go-to-definition from an app lands in `x.rx.d.ts`; with the `.rx` in
   the source maps it could land in the source.
