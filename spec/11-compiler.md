# 11 — The compiler

**Status: RULED 2026-10-24.** Where the production compiler lives and what it
reuses. `ref/` is the executable spec, not the product; this document says
what the product is so that `ref/` is built to be its conformance suite.

Ruling: **a separate Rust crate on top of Solid's `solidjs-compiler` crate.**
ReactiveScript owns parsing, checking and modules; Solid's crate owns the
JSX lowering. The alternative considered and declined: an `.rx` front end
inside `@solidjs/compiler`, beside TSRX. Earlier messages in the design
record argued each way; this is the decision.

---

## CP-1 — Two crates, one seam

- **CP-1a (ReactiveScript's crate).** Parses `.rx` and `.d.rx` (07), loads
  the module graph (09), checks the program (02–06, 08: rows, failures,
  regions, signatures, contexts), and lowers it: the reactive declarations
  to calls on the runtime helpers (`__rt`, the API `ref/compile/rt*.ts`
  defines) and the views to JSX — as an `oxc_ast::Program` in an Oxc
  `Allocator`, never as text.
- **CP-1b (Solid's crate).** `solidjs-compiler` lowers that program for a
  target — `dom`, `ssr`, `universal`, `dynamic`, hydratable or not — with
  the shared back ends every Solid source goes through. Hydration keys,
  marker regions, which holes are scoped and which fragment entries are
  memos (`documentation/hole-owner-id-matrix.md` on `next`) are its
  decisions; ReactiveScript makes none of them.
- **CP-1c (The seam).** One entry point Solid's crate does not yet export:
  compile from a `Program` instead of source text. `compile_inner` in
  `packages/compiler/src/compiler.rs` already has the shape — the TSRX
  route hands a lowered `Program<'a>` into the same `match options.generate`
  the text route reaches after `parse_program` — so the entry is that
  function with the parse step split off:

  ```rust
  pub fn compile_program<'a>(
      allocator: &'a Allocator, program: Program<'a>, source: &str, options: &CompileOptions,
  ) -> Result<CompileOutput, CompileError>
  ```

  `source` is the authored `.rx` text, which the back ends only use for
  spans; ReactiveScript's lowering keeps authored spans on the nodes it
  clones and leaves generated nodes unspanned, as the TSRX front end does
  (`frontend-notes.md`, "Stage 3"), so source maps and diagnostics come out
  on `.rx` positions. This is the only change the ruling asks of Solid; it
  is additive and shared with any other front end that produces an AST.

  *Found in porting (2026-10-27):* positions are not only for diagnostics.
  Solid's SSR props hoisting (`ssr/props.rs`, on by default) finds a
  component's props literal by its element's span, and constructs it ahead
  only from locals whose declaration ends before the element in the source
  (`declared_before`). An unspanned declaration counts as declared before
  everything, and `.rx` positions order the view after the declarations
  where the lowered module orders it first — either way the server output
  differs from what the same module gets as text. So the crate's program
  carries the lowered module's layout instead (decision 5): spans in print
  order on what that rule compares, `source` blanks of that length. `.rx`
  positions come from a map the crate keeps from layout to `.rx`: each
  layout position records the `.rx` line it was lowered from (a
  declaration's, a markup's), so Solid's source map is rewritten onto the
  `.rx` file (that line, at its first non-blank column) and a position in a
  Solid error is reported as `file.rx:line` (decision 6).

- **CP-1d (Styles: a second seam).** Scoped styles (07 §6b) are TSRX's
  engine, `compile_style` in `packages/compiler/src/tsrx/style/`, which
  "deliberately has no dependency on the TSRX/Oxc frontend; the frontend
  only needs to translate its template into `Element` values". It is a
  private module today. The second additive change asked of Solid is to
  export it (`compile_style`, `StyleInput`, `Element`, `StyleOutput`), so
  ReactiveScript's crate hands it a `.rx` view's elements and gets back the
  stylesheet, its hash and the elements to annotate — the same bytes a
  `.tsrx` file gets. (`ref/` reaches the engine by compiling a synthetic
  `.tsrx` fragment of the view.)

## CP-2 — Why not inside `@solidjs/compiler`

- `transform()` is Solid's public contract: one source module in, one
  module out, no state between calls. ReactiveScript's checks are whole-
  program — a signature is computed from the exporting module (MO-3), a
  failure is discharged through an imported component's summary (R-f-5),
  cycles are refused (MO-5), `.d.rx` files declare JS modules (MO-8). A
  per-module slot beside TSRX cannot hold them without a second,
  multi-module contract inside Solid's compiler, which would exist for one
  front end.
- TSRX fits that slot because it has no semantic layer: it is syntax that
  desugars to Solid's control flow and leaves every binding as authored.
  ReactiveScript is the semantic layer; the compiler is most of the
  language.

## CP-3 — Why not text

- `ref/compile/jsx.ts` emits JSX text and calls `transform()`. That is the
  right cost for the spec and the wrong one for the product: Solid's own
  runtime compilation moved off text projection ("no generated Solid-JSX
  text is parsed", `frontend-notes.md`) because a projection loses
  positions. A diagnostic on a `.rx` line and a source map to it need the
  AST route.

## CP-4 — The runtime

- **CP-4a (The package).** The reactive helpers ship as a small runtime
  package over `@solidjs/signals` and `solid-js`, in a client and a server
  build — `ref/compile/rt-web.ts` and `rt-server.ts` are their reference
  (`rt.ts` is the client's over the test renderer). Each build exports
  `createApp(options)`; a compiled module's default export is a function of
  the app (`main(__rt)`, or `module(__rt)` for a dependency, MO-1), so the
  helpers below are properties of `__rt`. It is `@reactivescript/runtime`
  (`runtime/`), built from the reference itself, so the package runs what
  every scenario runs; the export condition picks the build, as
  `@solidjs/web`'s does. The two builds create the same
  owners in the same order (10, Implementation); where the client creates
  one the server has no counterpart for, the server reserves its ids. A
  value-level catch primitive that Solid provided on both sides would
  retire the last of those reservations. Nothing in it adds run-time
  behaviour beyond Solid: each helper is a Solid primitive, a composition of
  them, or plain JavaScript the compiler would otherwise inline.
  One helper is not Solid's (ruled 2026-11-22): `__rt.copy(v)`, a copy of
  what a library's draft holds (arrays, plain objects, Maps and Sets
  copied through; anything else is itself), written wherever a draft is
  read as a value (09 MO-10i). It is what makes "a read of a draft is a
  copy" true of the compiled program, where the earlier revisions tried
  to prove no draft was kept; it is a value's meaning, not a check, and
  costs a `typeof` where the value is a primitive.

  *Who installs it (2026-11-24).* The runtime is the compiler's
  dependency: an app lists `@reactivescript/compiler`, and the modules the
  compiler writes find the runtime themselves. It had been asked of the
  app's `package.json` — and an app in Solid's start mode, which writes no
  line that imports it, failed under the dev server with no owner at its
  first `provide` (CP-4d): a usability defect of this project's, not the
  app's mistake. Two things carry it now.
  - *The published manifest* (`compiler/scripts/published.mjs`, written by
    the publish job as the platform packages are): the runtime in
    `dependencies`, and `solid-js` and `@solidjs/web` as peers — what the
    compiler's output runs on. Solid's Vite plugin loads with the app
    every package that depends on Solid, and that package's dependencies
    in turn, starting from the app's `package.json`; so it reaches the
    runtime through the compiler's, and under the dev server the runtime
    is on Vite's copy of Solid, as the app is.
  - *The front end* (`compiler/vite.mjs`, `runtimeFor`): the import a
    `?rx-lib` or `?rx-page` module carries is the bare name where the
    app's own imports reach the package (`node_modules` up from the Vite
    root) — one module with the app's `createApp`, by construction — and
    otherwise the compiler's own copy, by its folder, whose `exports` Vite
    reads for the environment (a package manager that hoists nothing). An
    import by path is never left to Node.

  One instance is kept by naming one module, not by a rule at run time. A
  package written in `.rx` imports the runtime as a peer (CP-4e), which a
  package manager resolves to the app's; under one that hoists nothing,
  an app with such a package lists the runtime, as the peer asks. An app
  that lists neither the compiler nor the runtime, with both reachable
  all the same, is the setup that is really broken: nothing tells Solid's
  plugin the runtime runs on Solid, and the server runtime says so in
  words at the first `provide`. Run: `compiler/test/runtime-resolve.mjs`
  (the three installs, the dev server and the built server);
  `bench/tasks/start-mode`, whose app lists no runtime.

- **CP-4b (The names, pinned 2026-10-26).** What compiled code calls. The
  Rust crate emits exactly these; a change is a change to both.

  | `__rt.` | lowers | over |
  | --- | --- | --- |
  | `source(name, init)` | `source x := e` (ST-1, ST-2a) | `createSignal`; structured: `createStore` behind a signal slot |
  | `question(name, fn, opts, mode, key?)` | `source x = e` (ST-5), with a guess (AC-3) or path writes | `createSignal(fn)`, `createOptimistic`, `createStore(fn)`, `createOptimisticStore` |
  | `memo(name, fn, opts)` | an equation (E-1), a hoisted `await` (R-1) | `createMemo` |
  | `deferred(name, fn, opts)` | `deferred x = e` (H-1) | `createDeferred` |
  | `keyed(name, key, fn)` | `x key k = e` (ST-4) | `createMemo` + `createProjection` |
  | `kept(v)` | a value an equation keeps beside `pre self` (C-2): a whole source or projection, copied at its root | none |
  | `draft(seed, body)` | `x = draft(pre x -> s) { … }` (ST-3) | `createProjection` |
  | `pre(get)`, `preOr(v, init)` | `pre y -> i` of another node (C-2) | `createMemo` |
  | `firstPaint(f)` | `await e -> v` (R-7) | the `loadingValue` option |
  | `clientQuestion(opts)` | an awaited call into `client` JS (SV-7b) | the `ssrSource: "client"` option |
  | `awaited(v)` | `await e` — the flight the memo returns or the action yields | identity on a promise |
  | `hoisted(name, get)`, `reg(name, entry)` after it | an equation's hoisted awaits, which `refresh` re-asks with it: claimed by its accessor | — |
  | `effect(n, inputs, apply)` | `effect (…) { … }` (EF, E-12) | `createEffect(compute, { effect, error })` |
  | `action(gen)` | `action f(…) { … }` (AC-1, AC-7); an inferred action, `(ps) => action(function* () { … })()` (AC-1b) | `action` over a generator |
  | `refresh(name, get)`, `affects(get)`, `until(p)` | AC-4, AC-5, AC-6 | `refresh`, `affects`, `until` (`until`: client build only) |
  | `snapshot(get)` | an imperative read (H-10, R-f-7) | `untrack` |
  | `untrack`, `latest`, `isPending` | `peek` (E-5), `latest` (R-12), `pending?` (R-9) | the same |
  | `eq(a, b)`, `fmt(v)` | `==` through a store (ST-2), a template part | — |
  | `errorClass(name, params, msg)`, `isA(e, classes)`, `PANIC` | `error C(…)` (R-f-1), a typed catch, `Panic` (R-f-10) | a subclass of `Error` |
  | `throw(e)` | `throw` as an expression (R-f-3) | — |
  | `settle(p, match, alt)` | `await … catch …` in reactive scope: a matching rejection lands `alt` as the answer where it is awaited (R-f-4), so it never becomes an errored node | `Promise.prototype.then` |
  | `catchMemo(f, match, alt)`, `catchRead(f, match, alt)` | no source form since 2026-11-19 (`CATCH_NOT_ON_AWAIT`, R-f-4); kept in the runtime until the lowering that emits them is removed | `createErrorBoundary` |
  | `tryCatch(f, match, alt)` | `await … catch …` in imperative scope | `try` |
  | `context(name, dflt)`, `provide(c, entry)`, `use(c, owner)`, `useGet(c, owner)`, `owner()`, `place(o)` | contexts (RG-7); `place`: the owner that reads a component's children, which a `use` in them reads under (the caller's, `o`, where nothing owns the read, or a snapshot or a context's value makes it) | `createContext`, `setContext`, `getContext`, `getOwner` |
  | `module(key, factory)` | an `.rx` dependency, once per app (MO-1); `key` is the file's name in a sibling-file build, the factory itself when modules are imported by source for a bundler (`rxc app`), so a module two programs share is one key | — |
  | `result(self, whole, parts)`, `parts(acc, name)` | what a fn answers, in a library build (09 MO-13i): JavaScript's call is handed `parts()`, `.rx`'s the accessor, with its parts kept beside it for a fn that hands them on | `getOwner`, `runWithOwner` |
  | `serverRef(name, fn)`, `serverCall(name, gen, args)` | a server fn as the client calls it, and its body (12 SF-2, SF-6, SF-7) | Solid's `"use server"` functions |
  | `show(v)`, `kids(v)`, `scopedClass(v, hash)` | `{e}` (a value formatted, a view inserted); `{props.children}`, a component's children (a view, or the list of views and strings a JS library passes, inserted as it is — `show` printed a list of strings as the list it also is, until 2026-11-24; `undefined`, `null` and booleans print nothing, as JSX has it, since 2026-11-25 — only a JavaScript host gives them; `kids` by whatever name the children are read, 03 RG-4b); a dynamic class with the view's scope (CSS-2). On the server neither escapes: the compiled view wraps every hole in Solid's `escape` (the runtime escaped as well until 2026-11-24, and a served `a < b` read `a &lt; b`: S-server-5) | — |
  | `TypedErrored`, `Portal` | `errored fallback(e: A)` (R-f-4), `portal` (RG-8) | `Errored`, `Portal` |
  | `B` | the language's built-in functions (`len`, `str`, `map`, `filter`, `sum`, `every`, `indexOf`) and `log`, where nothing binds the name (09 MO-1d) | — |

  The app itself: `mount(view, hydrating)` in the client build, `stream(view,
  sink)` in the server's.

  *A module is one module, whatever URL serves it (2026-11-24).* `module`'s
  key is the factory where modules are imported by source, which is one
  factory for one module in a bundle. A dev server is not a bundle: it
  serves a module again, under a new URL, after an edit of a file its
  program holds, and the browser evaluates each URL — a second factory for
  the same text. Vite 8 goes further: it writes the query of a module it
  marks `?import` (every module whose extension it does not know: `.rx`)
  in two orders, `?t=…&import&rx-dep` where it patches an importer's cached
  code and `?import&t=…&rx-dep` where it compiles an importer again, so one
  edit leaves one file loaded twice *in the same page*, after a full reload
  too. Two factories were two instances: a context declared in a module
  the app's entry and a route file both import was two contexts, and the
  route file read `RG-7b: no provision for team` for what the entry
  provides (met 2026-11-23, on TanStack Router with `.rx` route files:
  editing the index route's file). So under the dev server the front end
  names each compiled module — `module.__rxKey`, its path from the
  project's root, the way it is imported (a dependency, `?rx-lib`,
  `?rx-page`: three modules to a bundler, CP-4d, and so here) and a hash
  of its compiled text — and `module` keys an
  instance by the name where the factory has one: the same file with the
  same text is one instance however often it is evaluated, and an edited
  module, whose text differs, is another. A build names nothing (a module
  is bundled once). `compiler/test/vite.mjs` (*context*) holds it without
  a router — the cause is the dev server's — and
  `bench/tasks/router-rx-routes` with one; `runtime/test.mjs` the keying.
  The two spellings are a defect of Vite's, recorded and not filed.
- **CP-4c (The harness's, not the package's).** `reg`, `lookup`, `dget`,
  `dset` (a scenario's `handler` rows reach any live binding by name),
  `api` and `jsError` (`./api` and its declared errors as test flights,
  where a program imports the real module), `B.fetch` and `B.fail` (the
  scenario prelude), and `flights`, `lastKey`, `log`, `asyncError`,
  `frame` (what the runners observe). Compiled code calls them only in a
  conformance build — the compiler's option for running `scenarios/`
  (CP-5); `ref/compile/emit.ts` emits one for the runners. An app has no
  table of its names and keeps no log (2026-11-25: a table kept every
  binding of every instance, `compiler/test/leaks.mjs`). An app's code
  calls `api` too, for an import of `./api` (MO-8c): given no `api`, the
  app has no one to answer the call, and a development build says so on
  the console at the first, once an import. The language's `log`, which
  writes to the `log` the runners observe, prints in a development build.
  A runner's app (`createApp({ conformance: true })`) is silent.

  *`fetch` and `fail` are names only there (corrected 2026-11-24).* Both
  checkers took an unimported `fetch` or `fail` in any program, and an app's
  compiled code called the harness. The mark is the load's
  (`ModuleSet.conformance`): the checkers, the emitters and the projection
  read that one mark, so a check and its build cannot differ. `ref/`'s
  runners set it for a scenario's program and ask the crate with it
  (`rxc conform`, `lower` and `project` on stdin, `conformance: true`); no
  command that takes a file does, nor the Node-API build, the Vite front
  end, `rx-lib`, the language server or `rx-tsc`. Without the mark an
  unbound `fetch` or `fail` is `UNBOUND`, as JavaScript's other globals
  are, and `./prelude` has neither. S-module-46,
  `compiler/test/names.mjs`.
- **CP-4d (A JS host's `.rx` components).** A JS module may import an
  `.rx` module for its components rather than mount a program from it:
  `import pages from "./pages.rx?rx-lib"` compiles the module as a
  dependency is (`module(__rt)`, returning its exports; `rxc app --lib`,
  the Node-API `app(…, library)`), and the runtime's
  `components(pages)` turns those exports into Solid components the host
  renders itself (`const { PersonCard } = components(pages)`), or, the
  same bound, by name (`import { PersonCard } from "./pages.rx?rx-lib"`;
  the build's `components` lists the module's exported components). They are
  bound to the page's app (09 MO-13g), made on first use where the page
  has none: on the client, the first app of the page — an `.rx` program's
  own, where there is one; on
  the server, the request's, kept on Solid's request event
  (`locals`), so module state is per request (SV-4) as
  in a program's own server, and outside a request the render's (one per
  `renderToString` or `renderToStream`, found through the owner). A
  request's state lasts as the request does, across its renders, and a
  host may hold it (`holdRequest()`, 09 MO-13g). A host
  may pass the app itself
  (`components(pages, app)`); on the server, a use outside any render and
  any request with
  none passed throws (proposed 2026-11-21: one app for the process would
  share module state across unrelated renders; 2026-11-22: a render alone
  is enough, since it has an owner the app can be kept by). The
  module is checked as an entry is (its components' failures reach their
  own boundaries, or are refused: with the hosts known — a whole-program
  build, `rxc check --whole-program --host m.rx` — each component a host's
  module exports is checked as applied under a root of its own, 09
  MO-11s's cautious placement, so a failure, a context or a first load
  that its own view does not handle is `UNHANDLED_FAILURE`,
  `CONTEXT_NOT_FOUND` or the loading error, in that module; implemented
  2026-11-22, when the benchmark's Start task found such a page accepted);
  what the host passes in is typed by
  the module's projection: `rx-tsc` resolves `pages.rx?rx-lib` to
  declarations of its exported components (13 TY-1c), so a TSX host
  passing `PersonCard` a number is a type error on its own line. A
  TypeScript without `.rx` support takes them untyped, through the
  runtime's `@reactivescript/runtime/rx-lib` pattern. It is how a framework that owns routing and the document —
  TanStack Start's file routes, which its generator reads as TypeScript —
  renders `.rx` components (`examples/start`, `compiler/test/start.mjs`).
  A file-based router that takes `.rx` route files imports each as its
  page (2026-11-23): `import Person from "./routes/people/[id].rx?rx-page"`
  is `?rx-lib` with the module's **default component** as the default
  export, bound as the named ones are (the module itself is `__rxModule`);
  a module with no default component is refused there. It is what a
  router whose route file's default export is the page asks of a route
  file (`filesystem-routing`'s `toRoute`, with `extensions: ["rx"]`:
  `bench/tasks/file-routes`); `rx-tsc` types the import by the component's
  props. A route file is imported one way: the same module imported with
  `?rx-lib` and with `?rx-page` is two JavaScript modules, and two
  instances. What the host does with the components it renders — which
  contexts it provides, which layout a page is rendered in — is said by a
  host declaration (09 MO-14), and a component its view names is then
  checked there, not under a root of its own. A component of the host's
  own that an `.rx` component applies — the router's component in the
  app's entry, a layout's `<Outlet />` — is imported by that declaration
  from its JS module, and the host's records are then checked where it is
  applied (09 MO-14f). TanStack's generator, as released, has no option
  that admits an `.rx` route file, and its route files are the few lines
  of TSX above; with the option a fork adds (`routeComponentExtensions: {
  ".rx": "?rx-page" }`: 09 MO-14, *The native shape*) the generator imports
  each `.rx` route file as its page and writes the route object itself,
  which is `?rx-page` used as it is with `filesystem-routing`
  (`bench/tasks/router-rx-routes`).

  *A page's route options (2026-11-25).* A route is more than a
  component: a loader, the search it validates, what runs before it
  loads. With TanStack's generator those lived in a TS route module
  beside the `.rx` page, because a page module gave JavaScript its
  component and nothing else. An `.rx` module may export them as what
  they are, a record of functions —

  ```rx
  export route = {
    loader: () => fetchPeople(),
    validateSearch: (search: Record<string, unknown>) => ({ tab: search.tab === "role" ? "role" : "name" })
  }
  export default component Home() {
    people = useLoaderData({ from: "/" })
    …
  }
  ```

  — and a module imported `?rx-page` or `?rx-lib` hands JavaScript each
  **exported equation whose right side is a record literal of function
  literals** as a plain record under its name (`import { default as
  Page, route } from "./routes/index.rx?rx-page"`), beside its
  components. The build lists them (`records: { route: ["loader",
  "validateSearch"] }`), and each function of the record calls the
  module's own, in the page's instance of the module — made at the
  first call, as a library's exports are (09 MO-13e), so the record
  exists when the importing module is evaluated, before any app is
  mounted, which is when a router builds its tree. `rx-tsc` types the
  import by the module's projection (`typeof M.route`), so the types
  reach the host: the route TanStack's generator writes
  (`createFileRoute("/")({ ...route, component })`, the fork's
  `routeComponentOptionsExport`, 09 MO-14 *The native shape*) is typed
  by the loader and the validator the file exports, and through the
  registered router so are `useLoaderData({ from: "/" })` in the page
  and the `search` a `<Link>` to the route must give. **Nothing is
  added to the language**: an exported equation and a closure are what
  they were, and the checkers hold the functions as they hold any made
  in reactive scope (02 SC-3) — pure. A loader asks (`() =>
  fetchPeople()`, a `pure` import or a server fn); one that does
  something (`() => log("home")`) is `IO_IN_REACTIVE`, one with a
  statement body that writes is `REACTIVE_WRITE_IN_OWNED_SCOPE`, where
  it is written. What a host does not get: a record with a field that
  is no function literal (it stays the module's value, read through the
  module), and a route's own *components* (`errorComponent`,
  `pendingComponent`) — a component in a record of an equation is a
  value (09 MO-11c), and where the host renders it is not said; a
  route's failure and wait are held by regions, in the layout or the
  page. It names no router: a record of functions is any host's.
  `compiler/test/vite.mjs` (`records`); `bench/tasks/router-rx-routes`
  (a loader and a validated search, three type probes, three variants).

  *Solid's start mode (2026-11-24).* `@solidjs/vite-plugin` 3 has Start as
  a mode of the plugin — `solid({ start: true, ssr: true })` — which owns
  the entries, the dev server's render and the build: an app is its root
  component and whatever it renders, with no `index.html`, no mount file
  and no server file, and SolidStart is not needed for it. The root is a
  Solid component, and an `.rx` root is named as it is:

  ```ts
  const app = "src/App.rx";
  solid({ ssr: true, start: { app }, frontends: { ".rx": rx({ pages: [app] }) } })
  ```

  `start.app` takes any file there is, and start mode writes the import
  itself, with no query; a plain import of an `.rx` module is a program's
  entry (what `createApp` mounts), and a front end is not told who imports
  a module. So the front end is told which module: one that `rx({ pages })`
  names is compiled as a page — its default component, as `?rx-page` says
  — when it is imported with no query, and counts as a host's in a
  whole-program check. (Until this was taken, `src/App.ts` was one line,
  `export { default } from "./App.rx?rx-page"`, and it still works. The
  convention alone — `src/App.*` with no option — looks for five
  extensions, `.rx` not among them; that part is the plugin's.) The routes
  are `filesystem-routing`'s, over `.rx` route files, as in a client-only
  build. Built and run: `bench/tasks/start-mode` — each request rendered
  on the server, streamed and hydrated, by the Node server start mode
  emits and by its dev server.
  Under the dev server the app's modules run on Vite's copy of Solid, and
  a package Vite leaves to Node runs on Node's: the runtime must be the
  app's. It is, with the compiler listed (CP-4a, *Who installs it*).
- **CP-4e (A package's `.rx` modules) — proposed 2026-11-22.** A library
  written in `.rx` is built once for every app (09 MO-13e): `rx-lib`
  (`compiler/lib.mjs`, the bin of `@reactivescript/compiler`) compiles each
  module as CP-4d's library module is compiled (`rxc app --lib`, for `dom`
  and for `ssr`), and writes beside each pair the module that an import of
  the package resolves to. That module exports the factory as `__rx`,
  which a compiled `.rx` importer instantiates in its own app
  (`__rt.module(__rx, __rx)`, 09 MO-13c), and every other export through
  the runtime's `library(factory, name)`: a function per export that finds
  the app as `components` does (the page's, 09 MO-13g: on the server the
  request's, else the render's) and
  calls the instance's export — so one helper serves a component, an
  accessor, a fn, an action and an error class (`Symbol.hasInstance` tests
  the instance's class). `library` instantiates the module in a root of
  its own, named by `name` (`createRoot(…, { id })`, 09 MO-13h): made
  under no owner in the browser, and on the server under the owner the
  runtime keeps for the request, or outside a request under the render's
  root owner, so the state of a module first read inside a
  `<Show>` is not disposed with it, and its nodes' ids do not depend on
  where that was. A module
  with a fn that instantiates, or that holds no state (MO-13g), is bound by
  `primitives(factory, name, refs, stateless)` instead: the same, with the
  `ref` parameters of each fn by index, calling a fn so that it hands back its
  parts (MO-13i). They are the names the runtime adds
  for packages, and it is Solid's `createRoot` and a `Proxy`;
  `holdRequest()` is the other, a count (09 MO-13g). Which render the
  caller is in is Solid's public `getHydrationWriter()`. That render's
  root owner, and the request scope's event read in silence, are Solid's
  internals: read in `ref/compile/solid-internals.ts` alone, each
  checked against the public answer, refused by name where Solid is
  shaped otherwise, and asserted by `runtime/test.mjs` (09 MO-13h).

## CP-5 — `ref/` is the conformance suite

- The Rust crate is correct when it passes `scenarios/` through the
  runners that execute compiled code — the compiled runner's string-tree
  renderer, and the server runner's served, hydrated and browser-only
  tables — and through the types runner (13), with its checker's verdicts
  equal to `ref/src/check.ts`'s on every program and rejected variant.
  `ref/` has five runners: those, plus the interpreter and the oracle,
  which the crate is diffed against rather than run through. `ref/` keeps the
  TypeScript implementation as the specification of each pass and as the
  oracle the crate is diffed against; it is not the thing being shipped.

## CP-6 — The resolved model (between check and lower)

**Taken by default 2026-10-27 (issue #1, agreed by Ryan 2026-10-26) — veto
here.** The checker's resolution, kept as facts, so that lowering (and any
other analysis) reads what the checker decided instead of recognising source
spellings again. Compile-time only; nothing of it reaches run time.

- **CP-6a (the facts).** Per module: its *regions* (03: the program, each
  component, an imported module's alias, an instantiating `fn`, each
  `then`/`else` branch, `for` row, `loading`/`portal`/`errored` boundary and
  component children), its *symbols* (every name a declaration binds except
  constants: sources with whether they have a question, equations, props,
  fns, actions, components, imports, error classes, contexts, server fns)
  and its *computations*: an equation's memo (`deferred`/`keyed` where
  declared so), a source's question and seed, each reader of a view, each
  prop argument and handler, an effect's inputs and its `apply`, an action
  or server fn body, a `fn` body, a provision (RG-7) and a context's default.
  A computation lists its **reads**, **writes** and **calls**, and the
  computation it is nested in.
- **CP-6b (read modes).** A read of a source, equation, props or context
  (through `use`) is `tracked` in reactive scope (SC-1); `snapshot` in
  imperative scope (SC-2), under `peek` (E-5), in a source's seed
  (E-4) and as a value parameter's argument (E-10); or `pre` (C-2). Under
  `latest` / `pending?` it carries the probe (R-9, R-12); a read of one
  field of props or a store records the field.
- **CP-6c (writes and calls).** A write is `x := e` (W-1, with whether it
  writes a path), `guess` (AC-3), `refresh` (AC-4) or `affects`
  (AC-5); `use p := e` is recorded for the diagnostic it gets (O-4). A call
  names a fn, action, server fn or JS import called by name.
- **CP-6d (one walk, two implementations).** The facts are recorded by the
  checker's own walk, at the point where it resolves each name, in
  `ref/src/model.ts` (filled by `ref/src/check.ts`) and in the crate's
  `compiler/src/model.rs` (filled by `check.rs`). `ref/model.ts file.rx`
  and `rxc model file.rx` print it.
- **CP-6e (not a format).** No one outside the crate depends on it: it is
  not a stable IR and not a commitment to a second front end (issue #1).
  Ids are indices within one module's model.

## CP-7 — The crate today

`compiler/` is CP-1a's crate, `reactivescript` (binary `rxc`): its parse,
module, check and signature stages and CP-6's model, a port of
`ref/src/{parse,modules,content,signature,check,model}.ts`, and the lowering,
a port of `ref/compile/{emit,awaits}.ts` that hands each module to
`solidjs-compiler`'s `compile_program` as an `oxc_ast::Program` (CP-1c) and
its views' elements to `compile_style` (CP-1d). The Solid dependency is a git
pin in `compiler/Cargo.toml` that must equal `ref/SOLID_NEXT`.

CP-5 is `ref/crate.ts` (`npm --prefix ref run crate`): for every program in
`scenarios/` (programs, variants, rejected and types variants) and
`examples/`, both sides load the modules, parse, check, print signatures and
build the model, and must agree exactly — the AST, every diagnostic with its
message, each module's printed `.d.rx` and the model. With `--lower`, every
program the checker accepts (each scenario table with its handler rows, as
`compile/run.ts` compiles it) is also lowered by both for the universal, dom
and ssr targets, and each module's output must be the same JavaScript
(comments dropped, both printed by esbuild). With `RX_CRATE=1`, the runners
take the crate's output instead of the reference's (`ref/compile/lowered.ts`):
`compiled` runs the scenarios on its universal target, and `ssr` serves its
ssr target and hydrates with its dom target. The `"use server"` extraction
(12 SF-7a) is not the compiler's: it is Solid's `transformDirectives`, a
bundler pass over the compiled module, which the runner applies to either
output alike. `rxc compile app.rx --out dir [--target …]` writes each
module with its source map onto its `.rx` (CP-1c) and the stylesheet;
`ref/crate.ts --lower` also checks every map: each mapped line is the
module's, each source and equation declared once is declared at a position
mapped to its line, and on dom every element's line is mapped.

In a Vite app, `.rx` goes through Solid's own Vite plugin with no option:
its `frontends` hook (solidjs/solid-vite-plugin, with the compiler change
solidjs/solid#4320 so the secondary passes take any extension) has `.rx`
built in, and loads its front end from the project's
`@reactivescript/compiler/vite` the first time an `.rx` module is compiled
(decision 7). That package is the crate's Node-API build
(`compiler/src/node.rs`, what `rxc app` does), one binary per platform as
`@solidjs/compiler` ships. An `.rx` module JavaScript imports is a
program's entry (JavaScript can import only an entry: a dependency is a
factory over the app, 09 MO-1b), so no option names it: the front end
compiles the program whole from it (CP-2), each module importing its
dependencies as `./x.rx?rx-dep`, served from a program's build that contains
them; the build keys `module(key, factory)` by the factory, so a module two
programs share is one module. It returns the module's code for the
environment's `generate`, its map onto `.rx`, and on the entry the
stylesheet (CSS-4). Solid's plugin then takes it as it takes lowered `.tsrx`:
primitive names aside, its lazy, refresh and server-function passes (12
SF-7a, IDs hashed from the `.rx` path) and the stylesheet as a CSS module.
Every example app builds and runs in Chromium that way
(`compiler/test/vite.mjs`), each mounted with `createApp` from
`@reactivescript/runtime`, CP-4a's package (`runtime/`).

## CP-8 — Spans and the projection (for editors)

Ruled 2026-10-27 (Ryan, on the editor-support plan: spans replace lines).
An editor's features are TypeScript's, asked of the TSX projection (13
TY-1c), so every position has to cross between `.rx` and the projection.

- **CP-8a (spans).** The crate's AST records the byte range each node was
  parsed from: every expression and statement (a kind plus its span), every
  declaration (from its first keyword, `export` included), markup item and
  attribute (its name). A node the compiler makes has none (`Span::NONE`).
  `ref/` keeps lines: its AST is the grammar's specification, and the spans
  are where the crate's parser was, not a second grammar.
- **CP-8b (what a span promises).** Inside the source and inside its
  parent's span; a declaration's and a markup item's span starts on the
  line the node records; a name's span is the name, a member's ends with
  its property, an element's starts with its tag. `compiler/src/spans.rs`
  checks this, and `ref/crate.ts` runs it on every program.
- **CP-8c (the projection).** The crate projects a checked program as
  `ref/types/project.ts` does, text for text (`ref/crate.ts --project`), and
  records mappings: a piece of the projection that is a piece of the `.rx`,
  the same text on both sides — every name, member, literal, written type,
  tag and attribute the projection copies. `rxc project app.rx` prints the
  files, their mappings (`[generated, source, length]`) and the prelude;
  `RX_CRATE=1 npm --prefix ref run types` checks the scenarios on it.
- **CP-8d (diagnostics).** `rxc check --json` gives each diagnostic and
  parse error a range, as an editor and an agent read it: 1-based lines,
  0-based columns in UTF-16 code units (LSP's), and byte offsets. The
  checker is line-precise (CN-1a), so a diagnostic's range is its line's:
  from the first node that starts on it to the furthest any such node
  reaches on it (decision 9).
- **CP-8e (the editor).** An editor's parse recovers: a declaration that
  does not parse is a parse error on its line and is skipped to the next
  line that starts at column 0, and a missing expression is an empty name,
  so the rest of the module still checks and projects. On a module that
  parses, the recovering parse gives the strict parse's tree and no errors
  (`rxc conform` checks it on every program). `rxc serve` answers a
  language server a line at a time: per file, with the editor's unsaved
  text as overlays, the projection with its mappings (exact text) and
  ranges (what was written for an expression or statement, for placing
  type errors) in UTF-16 offsets, and the file's parse errors, else its
  checker diagnostics (CP-8d). `tooling/rx-language-server` is a Volar
  server over the same requests, and `tooling/vscode-rx` its VS Code client.
  The server runs the crate's WebAssembly build in process (decision 10).

## Decisions taken by default (veto here)

1. **The helper API is CP-4b's** (pinned 2026-10-26, taken by default —
   veto here). Renamed from the reference's first names, so that a name says
   which rule it lowers: `qsource` → `question`, `prevOf` → `pre`, `orInit`
   → `preOr`, `lv` → `firstPaint`, `cq` → `clientQuestion`, `cls` →
   `scopedClass`, `snap` → `snapshot`, `aw` → `awaited`, `raise` → `throw`
   (07 decision 11), `catchAcc` → `catchMemo`, `caughtRead` → `catchRead`.
   The rest kept their names, most of them Solid's.
2. **`compile_program` is proposed upstream as the seam** rather than
   vendoring Solid's back ends. If upstream declines, the fallback is a
   pinned fork exposing the same function — not a reimplementation.
3. **The resolved model is recorded during the checker's walk** (CP-6d,
   2026-10-27, taken by default — veto here), not computed by a pass of its
   own over the AST. The checker already resolves every name and knows the
   scope it is in; a second pass would re-derive both, and could disagree.
4. **The crate matches `ref/` beyond verdicts** (CP-7, 2026-10-27, taken
   by default — veto here): CP-5 asks for equal verdicts; the crate also
   gives the same AST, diagnostic messages and signature text, so that
   `ref/crate.ts` can diff it byte for byte. The port keeps the
   reference's orders (insertion-ordered sets and maps) for that reason.
5. **The crate's program carries the lowered module's layout, not `.rx`
   positions** (CP-1c, 2026-10-27, taken by default — veto here). Solid's
   SSR props hoisting reads source order as meaning, so the program's spans
   must order declarations and elements as the module's text would; `.rx`
   positions move to a map the crate keeps. The alternative is upstream:
   make `declared_before` independent of spans (e.g. from statement order
   in the semantic model), which would let the program keep `.rx` spans.
6. **`.rx` positions are lines** (CP-1c, 2026-10-27). *Superseded
   2026-10-27 by CP-8 (Ryan: spans replace lines) for the AST and
   diagnostics.* Source maps of the lowered module still map lines, below;
   they can now be made column-precise from the spans. A mapped position is the line of the declaration or markup
   it was lowered from, at that line's first non-blank column. The AST
   records lines (as `ref/`'s does, for diagnostics), not columns; columns
   need a span on every expression in both parsers, which nothing in the
   spec asks for yet. A handler or action statement maps to its
   declaration's line.
7. **`.rx` in Vite is Solid's plugin loading `@reactivescript/compiler`**
   (CP-7, 2026-10-27, taken by default — veto here). The compiler ships on
   npm under the `reactivescript` org as `@reactivescript/compiler`, a
   Node-API build per platform (`@reactivescript/compiler-<platform>`), with
   its Vite front end at `/vite`; Solid's plugin resolves it from the
   project, so an app adds the package and nothing to its config. No
   WebAssembly fallback yet (StackBlitz and other unlisted platforms):
   `@solidjs/compiler`'s `wasm32-wasip1-threads` build shows how.
8. **The projection maps only text it copies** (CP-8c, 2026-10-27, taken
   by default — veto here). A mapping joins the same text on both sides,
   so a position inside it maps exactly and `ref/crate.ts --project` checks
   every one. What the projection writes of its own (`__.set(…)`,
   `__.await_(…)`, a rewritten `==`) maps nowhere; an editor asking there
   gets the nearest mapped piece, as Volar does for Vue's and Svelte's.
9. **A diagnostic's range is its line's** (CP-8d, 2026-10-27, taken by
   default — veto here). The checker reports lines (CN-1a); narrowing each
   rule to the node it is about is per-rule work in both checkers, left
   for when an editor shows where it falls short.
10. **The language server runs the crate as WebAssembly** (CP-8e,
   2026-10-27, taken by default — veto here). Volar makes a file's virtual
   code synchronously, so the requests are synchronous calls into the
   crate built for `wasm32-unknown-unknown` (`compiler/src/wasm.rs`, a C
   ABI over linear memory with the host reading files), loaded once: one
   `.vsix` for every platform, about a millisecond per analysis. `$RXC`
   names a native `rxc` to run as `rxc serve` per request instead; both
   give the same answers (the LSP tests run on each). The Node-API build
   of decision 7 would serve the same requests, but one binary per
   platform; this build answers only `serve.rs`'s requests, so it is not
   decision 7's missing WebAssembly fallback for compiling.
