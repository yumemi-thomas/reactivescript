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
  place without an event: itself. The app outside a request is kept by
  the render's identity — `getHydrationWriter()`, Solid's public
  one-object-per-render, found through the caller's owner and never
  reused (it was first kept by the render's root owner, which Solid
  reuses for later renders, so the entry had to be deleted by hand at
  the render's end). The request event still wins where
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
  root is owned by nothing in the browser, on the server by the owner
  the runtime keeps for the request or, outside a request, by the
  render's root owner, and its id is given, not taken — the module's name, which
  `rx-lib` writes into the call. The `.tsx` app's hydration in the
  benchmark depends on it: with another id on one side Solid reports the
  `<Loading>` fallback it cannot find in the server's page.

- **A request's state lives as the request does** (MO-13g; item 5a of
  this list as it stood). *What was true:* the request's app was shared
  by every render of the request, and the modules JavaScript
  instantiated in it were under the *first* render's root, so they were
  disposed with it. A second render of the same request then read
  disposed nodes — in silence: a memo that had answered went on giving
  its last value, and the module's cleanups had already run
  (`runtime/test/request.mjs` against the runtime as it was: instance 1
  disposed before the second render read it). *What Solid offers for a
  request's end:* nothing. A request event is `{ request, locals }` and
  whatever the framework adds; `provideRequestEvent(init, cb)` is
  `AsyncLocalStorage.run`, which has no exit to listen for and whose
  scope outlives `cb`'s return in every continuation; `renderToStream`
  tells its caller when the stream completes (`onCompleteAll`, the
  sink's `end`), which is the host's to hear, and Solid's own table of a
  request's open renders is private. The only ends the runtime can see
  from inside are a render's (its root owner's disposal) and the
  event's collection. *What landed:* the request's modules are under an
  owner the runtime makes for the request, under no render. Each render
  of the request that uses the app holds that owner until the render
  ends; when no hold is left it is disposed at the end of that turn of
  the event loop (a `setTimeout(0)`, cancelled by a new hold), so two
  renders in a row and two that overlap read one live instance, and the
  state is released, by disposal, after the last. A use after that
  throws: the alternative was a fresh instance, a second state for one
  request, as silent as what it replaces. Two renders with an `await`
  between and nothing open meanwhile cannot be told from a finished
  request, so that host says it: `holdRequest()` returns the release.
  A request no render held is not disposed, only collected with its
  event; nothing else reaches its app. *Considered and not done:* a
  `FinalizationRegistry` on the event, to dispose a request nothing
  held — what it would call has to reach the state, the state can reach
  the event (a module may keep it, a render's context keeps it), and a
  registry keeps what it calls: one such request would then never be
  collected. And a table of renders by root owner in the runtime, which
  kept each render's context alive for as long as Solid pooled the
  owner; the test that asks that no event outlives its request found it.
- **Solid's internals, in one place** (MO-13h; item 4c as it stood).
  *What was searched* (Solid at `ref/SOLID_NEXT`, `packages/signals`,
  `packages/solid/src/server`, `packages/web/src/server.ts` and
  `storage/`): `getOwner`/`runWithOwner` (no way up from an owner);
  `createContext`/`useContext` (a render provides none of its own, and a
  host's render is not the runtime's to wrap); `sharedConfig.context`
  (the module global: whichever render started or finished last, which
  Solid's own comments warn can be another request's);
  `getRequestEvent()` (finds the caller's render through the owner, and
  warns where there is no event); `getTraceContext()` (the render's own
  object outside a request and the request's inside one: an identity
  for neither alone); `getHydrationWriter()`; owner ids (the root's id is
  the `renderId`, `""` by default: not an identity). *What was found:*
  one public route, for one of the three needs. `getHydrationWriter()`
  answers "which render is this" — one object per call of
  `renderToString`/`renderToStream`, found through the caller's owner —
  and the runtime now keys a render's app by it. Nothing public gives
  the render's root owner (to root a module under, and to hear the
  render end through `onCleanup`), and nothing public reads the request
  scope's event without warning that there is none. *What remains
  internal,* all of it in `ref/compile/solid-internals.ts`: (1)
  `owner._parent`; (2) `globalThis[Symbol.for("@solidjs/web/render-roots")]`,
  the WeakMap from a render's root owner to its context; (3) that
  context's `event`; (4) `globalThis[RequestContext].getStore()`. Each
  is checked where read; the root the walk finds is held against the
  public answer (`runWithOwner(root, getHydrationWriter)` is the
  caller's writer), and a mismatch throws with Solid's version and what
  is missing. The old fallback — "else the topmost owner" — is gone: it
  was the silent failure, an app for whatever was on top.
  `runtime/test.mjs` asserts the four facts against Solid itself (the
  installed release and the pin), and CI runs it. The browser's one use
  (`_parent` to the top, for the render's id) reads through the same
  file.

## Proposed to Solid (not sent)

What would let `ref/compile/solid-internals.ts` be deleted. Three
functions, each already implemented inside `@solidjs/web` under a private
name; the proposal is to export them.

1. **`getRenderOwner(): Owner | undefined`** (`@solidjs/web`, server and
   client). The root owner of the render the caller belongs to: on the
   server the owner `renderToString`/`renderToStream` claims
   (`claimRenderRoot`), found as `getHydrationWriter()` finds its render
   (through the caller's owner; with none, through the request scope
   when exactly one render is open for it); in the browser the root
   owner of the `render`/`hydrate` call. `undefined` outside any render.
   *Why:* a library that keeps state for a render needs an owner with
   the render's lifetime — to create under
   (`runWithOwner(getRenderOwner(), () => createRoot(…))`: state that
   must not be disposed with the component that first read it), to hear
   the render end (`onCleanup` under it), and for its `id`, the
   `renderId` its own ids must begin with to hydrate. Today that is
   `_parent` and the `render-roots` table; `@solidjs/web`'s
   `renderContextOf` and `solid-js`'s `callerRenderContext` are the same
   walk.
2. **`getRequestEvent({ optional: true }): RequestEvent | undefined`**
   (or `peekRequestEvent()`, which `@solidjs/web` has privately, extended
   by the owner's fallback). `getRequestEvent()` as it is, without the
   console warning where there is no event. *Why:* "is this a request?"
   is a question with two ordinary answers for a library that scopes
   state to the request when there is one and to the render otherwise;
   a render outside a request is, in Solid's own words, a normal thing.
   Today that is `globalThis[RequestContext].getStore()` and the render
   context's `event`.
3. **`onRequestEnd(fn: () => void): void`** (`@solidjs/web/storage`), or
   an owner for the request (`getRequestOwner()`), disposed when the
   request is answered: when `provideRequestEvent`'s `cb` returns, or,
   where it returns a promise or a stream result, when that settles or
   completes. *Why:* per-request state has no end to be released at.
   `AsyncLocalStorage.run` has no exit hook, the event has no lifecycle,
   and `eventRenders` (a request's open renders) is private. With it,
   the hold count, the turn of grace, the refusal after release and
   `holdRequest()` all go: the request's owner is the request's.

And one sentence of documentation: that `getHydrationWriter()` returns
the same object for every call within a render and another for each
render. The runtime relies on it as an identity; the code makes it true
(`context.writer` is made once per render) and the documentation does
not say so.

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
   roots it as `library` does. Until then such a module is not under
   the request's owner either: in a request with two renders its state
   is still the first render's, and MO-13g's lifetime is `library`'s
   alone. (b) A dependency two packages share is
   instantiated inside the root of whichever module needed it first; its
   ids follow that module's, so two packages first used in another order
   on each side would number it differently. *Proposed:* `__rt.module`
   itself makes a named root for a module of a package, which changes the
   ids of every program and wants its own change. (c) The render's root
   owner is still reached through Solid's internals, now in one file,
   checked and tested (above); the end of it is Solid's to give
   (*Proposed to Solid*).
5. **What MO-13g leaves.** (a) What a request's module asks is sent to
   the browser by the render in which it was first asked (a node keeps
   the render context it was made in): a second render of the request
   reads the answer and does not serialize it again, so a page hydrated
   from the second render alone would ask again. *Proposed:* nothing
   yet; one render per request is what frameworks do, and the second
   render in the cases met (a head) is not hydrated. (a′) A request no
   render held is collected, not disposed: its modules' cleanups do not
   run. A module instantiated by a server function's call alone is such
   a one. (a″) An export first used in a request *before* any render
   (in the handler) is made while Solid's module-global render context
   is whatever render ran last; as before this change. (b) Outside a request, an export used after an `await` in an
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

## Decided (2026-11-23)

Each item of *Still proposals*, by the same rule as the vocabulary (09
MO-8r): done where a correct program was wrong without it, refused where
the build can know, and otherwise left as a limit that is said, with the
reason it is not worth a mechanism.

| item | decision | what is true now |
| --- | --- | --- |
| 1. a signature that names another package's context | **refused at the build** | `rx-lib` fails when a printed signature's `uses(…)`, `provides(…)` or `retains(…)` holds a key that goes through `node_modules`, with the module and the key (`foreignKeys`, `compiler/test/lib.mjs`). A key by the package's name was the proposal; it changes what a key is for every module of every program and makes two installed versions one context. A package that needs another's context takes its value as a prop, or provides it from a component of its own. A JS module of the app's own that wraps a library's hook got another answer on 2026-11-23 (09 MO-12e): its declaration names the library's context, `export context c from "<module>"`, and the key is found where the program is checked, from the file that writes it — which a signature printed once for every install cannot do |
| 2. scoped styles | **fixed** | what the browser's import resolves to (`x.js`) imports the module's stylesheet (`import "./x.css"`), for the app's bundler to link; the server's entry does not. The stylesheet was written and exported, and nothing linked it |
| 3. server fns in a package | **dropped** as a proposal: `rx-lib` refuses, and stays so | the contract is Solid's `"use server"` pass, which extracts from the app's own modules. A package exports the fn the app wraps |
| 4a. a `?rx-lib` module rooted where it is first rendered | **fixed** | the plugin writes the module's name (its path from the project's root, the same in both builds) into `components(module, undefined, name)` and onto the module, and the runtime roots a named module as `library` roots a package's: under no owner in the browser, under the request's owner in a request, with the module's name for its id (MO-13h, MO-13g) |
| 4b. a dependency two packages share takes its ids from whichever needed it first | **left, as a limit** | both builds of a page instantiate in one order, so the ids agree; they differ only for a host that uses two packages' exports in another order on each side, which is that host's code. A named root in `__rt.module` would change the ids of every program for it |
| 4c. Solid's internals | as it was: one checked file; *Proposed to Solid* stands | — |
| 5a. what a request's module asks is serialized by the first render | **left, as a limit** | one render a request is what frameworks do, and a second render (a head) is not hydrated |
| 5a′. a request no render held does not run its modules' cleanups | **left, as a limit**; `holdRequest()` is the way | Solid's request event has no end to hear (*Proposed to Solid*, 3). A server function that instantiates a module with cleanups holds the request and releases it |
| 5a″. an export first used in a request before any render | **left, as a limit** | the same cause: nothing public says which render a handler belongs to before one exists |
| 5b, 5c | as they were | Solid's own owner-bound APIs have the first; nothing has needed the second |
| 6. a package's own TypeScript, a JS module typed only by its `.d.rx` | **dropped** as a proposal | a package builds its TypeScript before `rx-lib`, as the message says; a `.d.ts` for a JS module is its author's to write, as for any package |
| 7. a hash on the `//@ signature` line, for strict mode | **dropped** | strict declarations ask that a person's assertion about someone else's JavaScript was run. A printed signature is the publisher's artifact, as the compiled module beside it is, and no more forgeable than that module: a hash the publisher writes proves nothing the publisher could not also write. Strict mode exempts a marked file (MO-13b), and that is the whole rule |
| 8. `rxc lib` | not taken up: no program is wrong without it | — |
| 9. the language server on a package's `.d.rx` | not taken up: tooling comfort, no check | — |

## After the vocabulary's last withdrawal (2026-11-23)

What 09 MO-8r's settlement changes for a package written in `.rx`:

- **A printed signature says two things fewer.** A component's row no
  longer writes `renders` before a prop (a prop given on to one that
  renders what its value carries, MO-11o) nor `keeps(…)` after the props
  (the props whose value never leaves the component, MO-11l): both
  described values no declaration makes any more. A signature printed
  before, holding either, is read as if it did not: the words are not
  looked for, and nothing they said is checked.
- **A package may hand out an accessor that waits.** A JS module a
  package ships beside its `.rx` ones is declared as an app's is: a
  result's `ref` part takes `pending` and `fails(…)` (MO-10l), and an
  `.rx` module that binds it exports an equation whose row carries them
  to the importer (MO-3), as a question's does. A record with such a
  part is not exported whole (`RESULT_AS_VALUE`): the part is.
- **A router in a package** is a factory's component (MO-11j), as it
  was: nothing of a route tree in values was in a signature.

## A host declaration and a package (2026-11-23)

What 09 MO-14 changes for a package written in `.rx`, which is little:

- **A route file is rooted as a `?rx-lib` module is.** `?rx-page` (11
  CP-4d) is `?rx-lib` with another default export: the plugin gives the
  module's name to `components` in the same way (MO-13h), so its state
  lasts as the page or the request does and its ids are the server's.
- **A host declaration imports the app's own modules.** Its `.rx`
  imports are relative paths; a package's component reaches a page
  through the `.rx` module that applies it, where it is checked as ever.
  A router that renders a package's component directly as a route (an
  admin section shipped as a package) is not what the form says: the app
  wraps it in a module of its own, one line. (Since MO-14f the
  declaration also imports, from a JS module or a package, a component
  of the host's own that it renders through. That is a JS component with
  a row in a `.d.rx`. A package written in `.rx` is imported by its
  printed signature (MO-13a) and is not one: a layout shipped in an
  `.rx` package takes its pages as `props.children`.)
- **A printed signature is unchanged.** A component a host's view names
  is printed with what it needs from above (`uses(…)`, its failures) as
  any exported component is; the declaration is the app's, and is not
  shipped.

## `renders(H)` and a package (2026-11-24)

What 09 MO-11u changes for a package written in `.rx`:

- **A printed signature has two rows more.** A component that applies a
  component some fn `renders(…)` beneath says where, `hosts(<key>
  catches(…) provides(…); …)`, and a module whose code calls such a fn
  with components says what they let out, `export renders <key> from
  <fn>:<line> fails(…) uses(…)`. Neither is written by hand: both are
  what the body proved, as `retains(…)` and `takes(…)` are (MO-9b), and
  a package's shipped `.d.rx` carries them, so an app is judged against a
  package as against its source.
- **H is named by its declaration's path**, as a context is. Inside a
  package that is a path of the package; a key that goes through
  `node_modules` names another package's declaration where it happened to
  be installed, and `rx-lib` refuses it as it refuses such a context
  (MO-13b). So a package written in `.rx` may ship a toaster of its own
  and the function that shows a toast in it; a package that calls
  *another* package's `toast()` with a component, or mounts another
  package's `<Toaster>`, is built with that left to the app (the app
  shows the toast, or mounts the toaster). The same limit, for the same
  reason, as a context of another package.
- **Nothing at run time.** The word is a check's; a compiled call of a
  fn that says it is the call it was.
