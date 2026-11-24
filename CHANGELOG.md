# Changelog

## Unreleased

**A draft asks only what changes a verdict** (tooling/rx-language-server/DECLARATIONS.md, *The questions*; spec/09 MO-8v)

- **Changed: a `// TODO` in a draft is asked only where its answer changes what a checker does**, by one rule and no name
  (`create…`, `use…`, `on…`, `…Provider`): 753 over the coverage libraries' modules (924), each with what the row does
  now, what the word changes and why it is not proven (file:line). A fn under any name that answers a value is asked
  about; a row that instantiates is not. A generated declaration has none.
- **Changed: a result's field typed `Accessor` is drafted `ref` whatever its name** (`isActive`, `canUndo`: they were
  `() => T`). Read it, `x.isActive`; `x.isActive()` is TypeScript's error now, as of any accessor. `as` and `component`
  are no longer the only props drafted `string | Component`, and another library's own `Element` is no `View`. Drafts are
  made again once (draft 15).

**Upstream merged (e650b85): `ref/` runs on Solid main 30e7805eb.** The server keeps rendering a guessed list's truth, not
its guess layer: the layer throws out of the component on the released Solid the runtime is installed with (2.0.3,
solidjs/solid#5097), and there are no guesses on the server to show.

**A generated declaration refuses nothing an import with none is accepted for** (spec/09 MO-8l; bench/generated.mjs)

- **Fixed: what an import says of a drafted package stands** (`import pure { format } from "dates"`, `fails NotFound`,
  `client`, `server`). It was `IMPORT_ROW_MISMATCH`, and the call `IO_IN_REACTIVE`: upstream's R-io-4 programs, refused
  once the tooling drafted the package. A hand-written or shipped declaration is held to as before.
- **Fixed, of a drafted package:** a class or any other export the draft could not write, and a context, are imported as
  undeclared (`NOT_EXPORTED`, `UNBOUND`); an imported `pure` object's methods are pure; a primitive called in a `ref`
  attribute (`ref={tap(…)}`) is owned (`INSTANTIATION_NOT_BOUND`); a fn proven `instantiates` whose row has no `ref` is
  called anywhere where the import says `pure` (a handler, an action and an effect's block are still refused: nothing
  owns what it makes), and one whose row has a `ref` or makes a component by its type alone is called in a handler;
  `DISPOSER_DROPPED` is not asked of a type alone. Drafts are made again once (draft 14: `instantiates` beside a `ref`).

**`instantiates` read from the code** (spec/09 MO-8v, MO-10a; tooling/rx-language-server/DECLARATIONS.md, *`instantiates` without `pure`*)

- **Changed: `rx-declare` writes `instantiates` on a fn that makes what its owner keeps on every path that returns**,
  `pure` or not: 120 rows of the drafts of 31 packages, which a component may call again. `pure` is as strict as it was.
  Not on a fn that does so sometimes, later, or under an owner of its own, nor on one that hands back a promise or its
  undo. Read now too: `const f = c ? g : h`, and the methods of a rest parameter. Drafts in `node_modules/.rx-types/` are
  made again once (draft 13). **If a call in a handler is now `INSTANTIATION_NOT_BOUND`**, bind it in the component, or
  write the row without the word in `rx-types/`.

**A generated declaration holds only words its code proves** (spec/09 MO-8v, ruled 2026-11-24; tooling/rx-language-server/DECLARATIONS.md; spec/archive/generated-words-2026-11-24.md)

- **Changed: `rx-declare` writes no word off a name, a shape, a run or a list of libraries.** Gone: the list of words it
  knew of nine libraries (two were false of the library), `ref` off the shape `() => T` (seven were false: each read made
  another value), `instantiates` off `create…`/`use…`, `--run`, `--dom`, `--context` and `--types-only`, and the words an
  app's module copied off the library's rows (MO-8s). `ref` is written where the type is Solid's `Accessor`, or the code
  shows a reader. An absent word means what it meant. Drafts in `node_modules/.rx-types/` are made again once (draft 12).
  **If a program of yours reads a generated result as a value and is now refused** (`IO_IN_REACTIVE`): write the row in
  `rx-types/`, with `ref` where you know it is read.
- **Changed: `rx-verify` tests its own evidence.** What a run holds is run again over the module changed so that the claim
  is false, and is `unverified` if it holds there too. A `ref` part must answer alike when read twice, a `pending` one be
  seen to wait, a `handler` not be called while the call runs or the component renders, and `provides(c)` hold for what is
  made under it later. A callback with no word claims nothing (`n/a`; it was `held` or `unverified`). Records of earlier
  versions no longer count: run `rx-verify --record` again. A probe's `around` and `providers` are handed the module it
  runs (third argument), and `inside`, `uses` are new.
- **Fixed: `rx-verify`.** A provider that renders nothing of its children no longer shows `uses(c)`; one that fails by
  itself as its part does alone is no mismatch; a long `--json` answer is no longer cut short on a pipe; an export of a
  CommonJS build's re-exports is found.

**The suites run on Vite 8.3.8 and Solid 2.0.3** (bench, examples, the runtime's own tests)

- **Changed: what the benchmark, the examples and the runtime's tests install** — Vite 8.1.5 to 8.3.8 (Rolldown 1.2),
  Solid 2.0.2 to 2.0.3. The published peer ranges are as they were. Solid 2.0.3 adds `markRaw` to `solid-js` and nothing
  else in the packages used here; its compiler is unchanged since the crate's pin, and `ref/SOLID_NEXT` is ahead of it.
- **Fixed: the dev-server suites ran the Vite in Solid's checkout**, not the one an app gets. They run the benchmark's.

**The tooling's TypeScript is tsrs 7.1.0-beta.tsrs5 (TypeScript 7.1 beta)** (spec/13 TY-1; tooling/rx-language-server/README.md, *The checker*)

- **Changed: every verdict about types is tsrs's** — `rx-tsc`, the Vite build's gate, the check `rx-declare` makes of its
  draft, the check of a declaration against its module (TY-6), the editor's type errors. One exact version, in
  `@reactivescript/language-server`'s dependencies; `rx-tsc --version` prints it. There is no fallback: where tsrs cannot
  run, the tool says so and stops (`rx-tsc` exits 2, no draft is written).
- **Changed: what TypeScript 7 removed is removed here.** `baseUrl`, `moduleResolution: node10`, `target: ES5` and the
  other options TypeScript 6 deprecated are errors (TS5102, TS5108), `ignoreDeprecations` or not. `rx-tsc` takes
  `--noEmit`, `-p`, `--watch`, `--declaration` and the compiler options; `-b`, `--init` and `--showConfig` are refused, and
  it writes no `.tsbuildinfo`. An option's error names the option, without its place in the tsconfig.json.
- **Changed: Node 20.19, 22.12 or later** for `@reactivescript/language-server` (it was 18).
- **Changed: `rx-tsc --watch` reports what `rx-tsc` reports** (it reported TypeScript's errors alone).
- **Faster.** `rx-tsc` over the benchmark's 37 tasks: 64 s of CPU to 13 s; `rx-declare @ui-sdk/solid`: 16 s to 6.7 s; a small library's draft: no difference.
- **Fixed: a draft wrote `ref` in a record that may be absent** (`{ name: ref string } | null`), where the notation does not
  read it: the crate's check of the row was not TypeScript. Its accessors are drafted as the functions they are.
- **Known: TypeScript 7.1 beta refuses some correct programs TypeScript 6 accepts** — a value of a generic function type
  that writes a conditional over its own type parameter, assigned to that same type (microsoft/TypeScript#64673, fixed by
  #64307, not merged). A declaration's row is not concerned: it is checked as an instance of its type, which relates.

**Drafts are short, and the tools faster** (tooling/rx-language-server/DECLARATIONS.md, MO-8o)

- **Changed: a component whose props no module names, more than 24 of them, is drafted by its place**, `props:
  Parameters<typeof import("kit").Part>[0] & { … }`, with only the fields the checker reads after it (every attribute of
  its element was written out: 24 KB a row). `@ui-sdk/solid` drafts to 0.23 MB, from 4.46 MB. No fact a checker reads is
  lost, no `any` is added, and an app's types are the library's own as before; a declaration you keep needs no change.
  Generated declarations are drafted again once (draft 10).
- **Changed: `rx-declare` checks a row only where a reading could say more than one that holds.** `@wardic/solid` takes
  17 s of CPU (146 s), `@ui-sdk/solid` 24 s (137 s).
- **Changed: the suites run several at a time, reported in order**: `ref`'s SSR scenarios, the
  language server's suites and the benchmark's tasks run (`RX_JOBS`, `BENCH_JOBS`).

**What an independent review found, acted on** (spec/09, rewritten to its rules; spec/archive/; tooling/rx-language-server/DECLARATIONS.md)

- **Fixed: strict declarations certified claims nothing had tested.** Each claim of a row has a name and a result of its
  own (`uses:theme`, `rejects`, `callbacks:onPick`); a `uses(c)` needs a failure without `c` and a run with it; a
  `rejects(E)` needs something that fails. Records of earlier versions no longer count: run `rx-verify --record` again.
  Expect rows that passed to be `unverified` — nothing had shown them.
- **Fixed in both checkers: a name is its binding's.** A sibling component's local of the same name no longer refuses a
  record of components given by name (`COMPONENT_AS_VALUE`) or a named draft callback (`DRAFT_ESCAPES`); a loop's
  variable or a parameter named as an import whose methods have rows is another binding and is accepted, and a
  declaration that shadows it is refused once (`SHADOWED_IMPORT`, twice before). The type `"ref label"` keeps its text.
- **Fixed: `rx-verify`.** A module node cannot load is `unverified`, claim by claim (it died). A loader whose answer
  changes is not a `pure` mismatch; a hook that fails under its provider for another reason than alone is not a
  `provides` mismatch.
- **Removed: `rx-declare --source`** (it wrote comments, for the 16 packages of 192 that ship their source; what the
  shipped code proves is written into the row), and `handler` read through a component of the same module (it proved no
  word in 193 modules). An element's own event is read as before.
- **Changed: the benchmark counts an `any` where it stands**, a good program once, and each claim by its result.
  bench/README.md says what earlier numbers overstated.
- **Changed: spec/09 is its rules only** (1,110 lines, from 4,394). The RFCs, the chapter as it was and the withdrawn
  rules are in `spec/archive/`; how the tools draft, audit and verify is in DECLARATIONS.md.

**`rx-declare` reads JSX and contexts; every word of a declaration is audited; drafts carry no marks** (spec/09 MO-8w; spec/archive/rfc-declaration-types-2026-11-22.md, *A fifteenth round*)

- **New: `handler` on a component's prop, read from JSX.** A prop that reaches only an element's event —
  `onClick={props.onPress}`, a closure written there, `[f, data]`, `<button {...rest}>`, through `omit`, `merge`,
  `{ ...props }`, through a component of the same module, through `Object.entries(handlers)` given to
  `addEventListener` — is written `handler`. Called while the component renders, rendered as a child, or handed to
  a component whose code is not read, it is not. A package is read from the file its `solid` condition names (its
  JSX), and `createComponent(Tag, { … })` in shipped JavaScript is read as the same thing.
- **New: `uses(c)` and `provides(c)`, with the `export context` rows they name.** `uses(c)` where `useContext(C)`
  runs on every path of the call and nothing answers without a provider (no default; a `null` the code throws on);
  `provides(c)` where the component renders `<C value={…}>` and everything it is given that may be a view is written
  among that provider's children. A context read on one path only, a provider beside `props.children`, children read
  before the provider: no word. **`uses(c)` is written only beside a `provides(c)` of the same draft** — a context
  nothing is shown to provide would refuse every program.
- **New: a value made by a call is read.** `export const useKeys = createSingletonRoot(() => …)`, a component made
  by `rootScope(function Toggle(props) { … })`, `export const [Provider, useIt] = make(…)`, `Object.assign(toast, {
  success })`: the row's words are read from the function the factory hands back, where the code shows which that
  is. State the made function shares between its calls (a counter, a cache) is refused as a module's variable is.
  A call is read with the arguments it is given, so a wrapper of your own that never passes an option can be
  `pure` where the library's function is not.
- **New: `rx-declare --audit <file.d.rx>`.** Every behaviour word the declaration has — `pure`, `handler`, `draft`,
  `rejects(E)`, `uses(c)`, `provides(c)`, `nests(…)`, `renders(H)` — whoever wrote it: *proven* by the code,
  *contradicted* by it (exit 1), or neither, with the first thing the reading stops at. `--json` for a tool.
- **Changed: `rx-verify` reads the code first.** A word the code contradicts is a mismatch — `createSorted: pure is
  contradicted by the code: it changes its argument `list` in place (.sort())` — whether a tool or a person wrote
  it; a word the code proves is run against what was read; the last line counts both and the
  rest. **If `rx-verify` fails after this on a word you wrote:** the message says what the code does and where.
  Take the word off, or call the function from a module of your own that does not reach that branch.
- **Generated declarations take the new words** (`node_modules/.rx-types/`, MO-8l; the draft rule is 9, so they are
  drafted again once). A kit's part rendered outside its root is refused where the kit's code shows the root to
  provide what the part reads. **If a program of yours is refused after this** with `CONTEXT_NOT_FOUND` on a
  package's component or hook: the package's code reads a context on every call, and nothing above the place
  provides it — render it inside the component the message's context belongs to.
- **Fewer questions in a draft.** "Which context does this hook read?" is not asked where every call the hook makes
  is read and none asks for one; "does it provide a context?" where the component renders no provider and nothing
  that is not read; "where does the library render it?" where the component a function is given is called while the
  function runs; "is the result a store?" where a getter of the record only reads a signal made there.
- **Fixed: a store made from a function was taken for a plain value.** `createStore(fn, …)` is a projection, whose
  fields may wait; a function that hands one back is asked about again.
- **Fixed (the benchmark's own declarations): `@solid-primitives/sortable`'s `createSorted` is not `pure`.** Under
  `{ dirty: true }` it sorts the list it is given in place. It was declared `pure` by hand; the audit found it.

**`rx-declare` reads `pure`, `handler`, `draft` and `rejects(E)` from the code** (spec/09 MO-8v; spec/archive/rfc-declaration-types-2026-11-22.md, *A fourteenth round*)

- **New: a draft writes the words the code proves.** `rx-declare` reads the JavaScript an import resolves to — your
  own module, a package's shipped ES module, every build its export map has — and writes `pure` before `fn`,
  `handler` before a callback's type, `draft` before a parameter the function changes in place and `rejects(A | B)`
  after the signature, **only where the code proves it**: `pure` where the call only computes (no write outside what
  it makes, no clock, randomness, environment or code it cannot read), `handler` where every call of the callback is
  behind a listener, a timer, an observer, a promise or an `await`, `rejects(E)` where every `throw` it reaches is of
  a class the module exports. Anything it cannot see through is left as it was: io, no `handler`, `Error`, and the
  question asked.
- **New: `rx-declare --why`** — for every row, what proved each word, or the first thing in the way with its file and
  line. **`--no-infer`** (or `RX_DECLARE_INFER=0`) drafts from the types alone.
- **Generated declarations take the proven words too** (`node_modules/.rx-types/`, MO-8l; the draft rule is 8, so they
  are drafted again once). A package's function that only computes can be called where a view computes without a
  declaration of your own; a callback its code calls only later may write a source. Nothing is guessed: a name is
  still not a reason. **If a program of yours is refused after this:** a generated row now says `draft` for a
  parameter the function changes in place (pass it a store's draft, or a copy), or `instantiates` for a proven-`pure`
  function that makes Solid nodes (bind its result once).
- **Fewer questions in a draft.** A question the code answers is not asked — yes (the word is written) or no (a
  callback called while the call runs, a parameter never changed, a promise that rejects with no class of the
  module's). *"Is the result a store with fields that wait or throw?"* is asked only where the code does not show
  the result to be a value built there. *"N signatures in the library's types"* was never a question: it is a note
  for `--explain`, and stays among the questions only where the signatures differ in what the checker reads.
- **`rx-verify` checks more, for a word the code proves:** a `pure` function must change nothing it is given,
  leave no global and ask neither the clock nor for a random number while it is called; a `handler` must not be
  called while the function's own call is running; a `rejects(E)` must reject with a class of its row under the
  probe's arguments. A verified record is version 7 (`rx-verify --record` again).
- **Fixed: a property that may be absent was drafted as a method.** `_replaceRouteChunk?: (…) => void` on TanStack
  Router's router became `export fn router._replaceRouteChunk(…)`, a row TypeScript does not hold (`undefined` is no
  function), written with `any` for every type. It has no row now.

**Methods of a library's object, route options in an `.rx` route file, layouts under code routes, fewer modules of your own** (spec/09 MO-8t, MO-8u, MO-11c, MO-14f, MO-14g, MO-14h; spec/11 CP-4d; spec/archive/rfc-declaration-types-2026-11-22.md, *A thirteenth round*)

- **New: a method of a library's object has a row** (MO-8t). `export fn toaster.show(toast: Component<…>): number
  renders(Toast.List)` beside `export const toaster`, `export fn toast.success(…)` beside `export fn toast`: a fn's
  row, with every word a fn has. Call the library as its documentation does — `toaster.show(Saved)`,
  `toast.success("saved")`, `query.clear()` — with no module of your own in between; `rx-declare` drafts the rows.
- **Now refused (these were accepted, and are mistakes): an io method called while a view computes.**
  `{toast.success("saved")}` in a view or an equation showed a toast on every computation. It is `IO_IN_REACTIVE`
  where the method's row says `fn`; where a method has no row and its declared type answers nothing or a promise (a
  declared `const`'s methods were never read; a method written as a method, `navigate(to: string): Promise<void>`,
  was not read at all, in a result's type, a prop's or a context's); and where it is a method of an import that is
  io itself (undeclared, or a declared `fn`). **If your program is refused by this:** call the method from a handler
  or an action; if it only reads, give it a row, `export pure fn client.get(key: string): string`, or import the
  module `pure`.
- **New: `SHADOWED_IMPORT` for a second binding of an import whose methods have rows** — a parameter, a local or a
  loop's variable named as the import is. Rename one.
- **New: a module's default export needs no helper** (MO-8u). `import { default as useOnlineStatus } from
  "solid-use/online-status"` with a row named `default` (`export pure fn default(): ref boolean`, `export component
  default(props: …)`). This always parsed and checked; `rx-declare` now drafts the row instead of telling you to
  write a JS module, and the `.d.ts` a declaration stands for writes it as `export default`.
- **New: a record or a list of components may have a name** (MO-11c). `builtins = { Heading, Paragraph }`, then
  `<Markdown builtins={builtins}>`, is read as the literal — provided every mention of the name is such a prop. It
  was `COMPONENT_AS_VALUE`.
- **New: a layout may render the router's outlet through components of its own** (MO-14f). `Root` applies `<Frame />`,
  `Frame` applies `<Outlet />`: the pages are checked at the outlet. It was `NESTED_NOT_RENDERED` on the layout.
  `rx-declare --host --routes` finds the outlet, and your entry's router component, through the `.rx` modules in
  between.
- **New: code-based routes with their layouts' regions** (MO-14g, MO-14h). `rx-declare --host --routes src/main.rx
  src/main.rx` compiles the module that exports your TanStack router, runs it, and reads the tree off the router
  object; under that declaration a page given to `createRoute` is checked where its layout renders it, so a root
  layout's `errored` and `loading` around `<Outlet />` hold its pages. It was refused (`UNHANDLED_FAILURE`). Export
  the route components and the router; the tool needs `@happy-dom/global-registrator` in the project.
- **New: an `.rx` route file exports its route options** (CP-4d). `export route = { loader: () => fetchPeople(),
  validateSearch: … }` reaches JavaScript as a plain record when the module is imported `?rx-page` or `?rx-lib`, and
  TanStack Router's generator spreads it into the route it writes — with the fork's new option,
  `routeComponentOptionsExport: "route"` (`github.com/yumemi-thomas/router`, branch `rx-route-files`, `7ba2912`; not
  upstream). The loader's answer types `useLoaderData({ from })`, and a route's `validateSearch` types its links.
- **`rx-declare` knows more of three libraries**, each run: `@solidjs/router`'s `useParams`, TanStack Router's
  `useLoaderData` and `useSearch`, UI SDK's dialog and radio-group contexts, Kobalte's `toaster.show`.
- `rxc app --unchecked` and an eighth argument of the Node API's `app` compile a program whatever the checkers say:
  for the tool above, never for a build.

**An app lists the compiler and nothing else, an `.rx` root in start mode, a router's own convention** (spec/11 CP-4a, CP-4d; spec/09 MO-14g, MO-8s; spec/archive/rfc-declaration-types-2026-11-22.md, *A twelfth round*)

- **Fixed: under Solid's start mode's dev server, `provide` failed unless your app listed `@reactivescript/runtime`.**
  That was this project's to solve. `@reactivescript/runtime` is now a dependency of `@reactivescript/compiler`
  (which also names `solid-js` and `@solidjs/web` as peers), and the Vite front end finds the runtime itself: your
  app's own copy where its imports reach one, the compiler's otherwise. You can remove `@reactivescript/runtime` from
  your `package.json` unless your own code imports it (`createApp`). The message stays for the setup that is really
  broken — neither package listed, both installed — and now says what to list.
- **New: an `.rx` root for Solid's start mode, with no `src/App.ts`.** `solid({ ssr: true, start: { app: "src/App.rx" },
  frontends: { ".rx": rx({ pages: ["src/App.rx"] }) } })`: the new `pages` option names `.rx` modules that JS imports
  by file, with no query, for their default component. The one-line `src/App.ts` still works; delete it when you add
  the option.
- **New: `rx-declare --host --routes <router module>`** — a `filesystem-routing` router with a convention of your own
  (`toPath`, `toRoute`, another router class) is written once as a module, given to the plugin (`fileRoutes({ router
  })`) and named as the declaration's source; the tool asks the router for its routes. **A routes directory under a
  Vite config that sets `toPath`, `router` or `routers` inline is now refused** (`HOST_VIEW_STALE`, with the fix in
  the message): it was read with the package's default convention, and the declaration could nest pages as the
  router does not. Move the router into a module as guide/libraries.md shows, then `rx-declare --host --routes
  <module> [<entry.rx>…] --out src/host.d.rx`.
- **`rx-declare` carries a library's words through two more shapes of a wrapper** (MO-8s): a component that renders
  the library's inside a fragment, alone, and a hook that calls a helper of the same module which calls the
  library's hook at the top of its body.

**The router's own tree, a dev server that keeps one module one, Solid's start mode** (spec/09 MO-14g, MO-8s, MO-11u, MO-13b; spec/11 CP-4b, CP-4d; spec/06 ST-4d; spec/10 SV-7c; spec/archive/rfc-declaration-types-2026-11-22.md, *An eleventh round*)

- **Fixed: after an edit under the dev server, a page could read `RG-7b: no provision` for a context your entry
  provides** — until the server was restarted; a reload did not help. A dev server serves a module again under a new
  URL after an edit, and Vite 8 writes that URL in two spellings for one module (`?t=…&import&rx-dep`,
  `?import&t=…&rx-dep`), so the browser evaluated the file twice and a context declared in it existed twice. The
  plugin now names each compiled module under the dev server and the runtime keys a module's instance by the name:
  the same file with the same text is one module however often it is loaded. **Update `@reactivescript/compiler` and
  `@reactivescript/runtime` together.** A build is unchanged.
- **New: `host.d.rx` is read off the router** (MO-14g). `rx-declare --host --routes <source> [<entry.rx>…]` writes the
  whole declaration — the route components, the nesting, your entry around the router and the component it renders
  the routes through, the router's outlet — from TanStack Router's generated `routeTree.gen.ts`, from a routes
  directory `filesystem-routing` scans, or from a JSON tree. Its first line records the source (`//@ routes …`), and
  from then on the file is that tree's: the dev server writes it again when a route file is added or moved, and
  `rx-tsc`, `rx-verify` and `vite build` refuse one that has fallen behind (**new diagnostic `HOST_VIEW_STALE`**, the
  tools'; `rx-declare --host --sync` fixes it, `--check` asks). `rx-verify` hands the probe the routes
  (`scene(rx, h, routes)`, `act(rx, h, route)` for each page), so a probe restates none either. A declaration with no
  `//@ routes` line is written by hand and behaves as before. To move an existing one: generate the router's tree
  (`vite build`), run the command over your `host.d.rx`, and change the probe to build its routes from the third
  argument (guide/libraries.md has one).
- **New: `.rx` route files on TanStack Router**, with a generator option that is a fork's and not yet upstream
  (`routeComponentExtensions: { ".rx": "?rx-page" }`, github.com/yumemi-thomas/router, branch `rx-route-files`): a
  route file is its component, and the generator writes the route objects. With the router as released a route file
  stays a few lines of TSX that hand the route an `.rx` component; both are in guide/libraries.md.
- **New: Solid's start mode** — `solid({ start: true, ssr: true })` in `@solidjs/vite-plugin` 3 — builds, serves and
  hydrates an `.rx` app with no `index.html`, no mount file and no server file; SolidStart is not needed on Solid 2.
  The root is an `.rx` file named in the config (above; it was first `src/App.ts`, one line: `export { default }
  from "./App.rx?rx-page"`). The routes are `filesystem-routing`'s. A runtime that Vite leaves to Node under the dev
  server says so (`provide …: no owner. A component is rendered by one copy of Solid and @reactivescript/runtime
  runs on another`) where it threw `Cannot read properties of null`; the entry above is what keeps an app from
  meeting it.
- **New: `rx-declare` drafts the declaration of a small module over a library whole** (MO-8s). A module that exports
  a library's component again, renders it and nothing else, binds what a factory makes, calls a library's hook at
  the top of its own, or hands its argument straight to a library method takes the words of the library's rows:
  `provides(router)` on the component that renders `<RouterProvider>`, `pure` and `uses(queryClient)` on a hook over
  TanStack Query's `useQuery`, `pending fails(Error)` on the field that reads its `data`, `renders(Toast.List)` on a
  function over Kobalte's `toaster.show`. Nothing is guessed: a word is copied from the row it was written on, in
  the shapes where the text shows the module does that and no more. `--types-only` leaves them out.
- **New: `rx-declare <package> --only <export>,…`** writes the rows an app keeps: those exports', the contexts their
  words name and the types they name (TanStack Router: 28 rows of 296).
- **Changed: fewer parts of a draft are said by their place.** An accessor's options record on a fn with type
  parameters of its own is written with them (`ref options: { queryKey: QueryKey; queryFn: () => Promise<TData> }`),
  and a prop that is an object with functions of its own is no longer taken for a record of components — which had
  cost `<RouterProvider>` its named props (`RouterProps<TRouter, TDehydrated>` now, thirteen by-place parts fewer).
  A drafted row may differ from the one an earlier version wrote; `rx-tsc` holds either.
- **New in development builds: a keyed list given two rows with one key is named on the console** (`DUPLICATE_KEY
  [ST-4d] …`), once for a list and a key. Rows written out with one key were already refused by the checker; a key
  a click or an answer computes was not reported by anything, Solid's development build included. The program goes
  on as its production build does. Production builds read nothing.
- **Changed: `rx-verify` runs a `pure` fn on both sides** — with a browser's globals and without (a second
  process) — and a plain answer that is steady on each side and differs between them is a MISMATCH: a page would be
  served with one answer and hydrated with the other, and neither the checkers, the build nor Solid's hydration says
  so (10 SV-7c). The fix is the one the language has: what only the browser knows is `client` JS.
- **Changed: `rx-lib` refuses a package whose signature names a file it does not ship** — a library declared in the
  package's own `rx-types/` and named by a `renders`, `hosts`, `uses` or `provides` key. It was built without a word,
  and in the app that installed it the key met nothing. Leave the call to the app, or take the value as a prop.
- **Decided, and not added** (MO-11u, MO-13b; each with the program that was run): a row for a method of a library's
  object (`toaster.show`), a layout's regions credited to its pages under `renders(H)`, and a package naming another
  package's host.

**A component a library renders later; components in a record** (spec/09 MO-11u, MO-11c, MO-11s, MO-8r; spec/13 TY-3d; spec/archive/rfc-declaration-types-2026-11-22.md, *A tenth round*)

- **New word: `renders(H)` after a declared fn's signature.** It names a component the same `.d.rx` declares: the
  components the fn is given are rendered by the library later, beneath an application of that component. A toast
  shown from a handler and rendered by a toaster, a page given to `createRoute` and rendered by the router's
  provider:

  ```rx
  export fn toast(message: View | (() => View), data?: ExternalToast): string | number renders(Toaster)
  export pure fn createRoute(options: RouteOptions): Route renders(RouterProvider)
  ```

  Each component is checked among H's children **at every place your program applies H**, in whichever module, with
  what is above each: a toast may read a context you provide above `<Toaster>`, and the same `provide` beside the
  toaster is `CONTEXT_NOT_FOUND` on the line of the call. With no application of H anywhere, the component is held
  to what H itself uses and provides. It was `CONTEXT_NOT_FOUND` on the correct program (the component was checked
  under a root of its own), with no way to say it. Three libraries of Solid 2 write the word: solid-sonner,
  Kobalte's toaster and TanStack Router's code-based routes. `rx-declare` drafts it for solid-sonner and TanStack
  Router, and asks the question of every fn that is given a component.
- **It is not the words withdrawn on 2026-11-23.** `renders` alone, `renders(later)`, a prop's `renders`,
  `nests(component under parent)`, `outlet` and `renders(root, …)` are still refused by name. `renders(H)` names a
  component and follows no value; nothing is confined, and `RENDERS_ESCAPES` is no diagnostic.
- **TanStack Router's code-based routes can be written in `.rx` again**, with the library's own `createRoute`, and
  the route types register your router (a link to no route is a type error). Pages are checked side by side beneath
  `<RouterProvider>`: a layout's own `errored` around its `<Outlet />` is **not** credited to its pages. Give a page
  its own region, or put it above the provider; for a tree whose layouts are checked, keep the factory or a host
  declaration (guide/libraries.md).
- **New: a record or a list of components in a JS component's prop** (`<Markdown builtins={{ Heading: Heading }}>`,
  `<Tabs panels={[First, Second]} />`). Where the prop's declared type holds a `Component`, each component in the
  literal you write there is checked as applied beneath that component. It was `COMPONENT_AS_VALUE`. A record built
  elsewhere and passed by name still is: write it in the prop.
- **Changed: the bar a declaration word is held to counts the Solid 2 ecosystem's releases, pre-releases
  included** (MO-8r), not only the libraries the benchmark covers.
- **Changed: `rx-verify` runs two claims it took on trust.** That a JS component renders what a `Component` prop is
  given beneath itself (DV-24) is checked against the probe's scene, and a component that mounts it elsewhere is a
  MISMATCH; `rx-tsc --rx-strict` asks for it of every component row with such a prop, so **records made by an older
  rx-verify need a rerun** (`rx-verify --record`). And a fn that *calls* a component it is given with no owner at all
  is reported: in Solid 2 nothing the component makes is ever disposed there, and in development `useContext` throws
  `NoOwnerError`. MO-11s no longer says a root of its own is the least a library can give a component.
- **Changed: a component that declares no props is typed as a function of nothing** (TY-3d). `component Saved()` was
  `(props: any) => …` to TypeScript; it is `() => …`, which a library that asks for a function taking none accepts.
  **If you pass attributes to a component that declares no props, TypeScript now refuses them** (the component could
  not read them): declare the props.
- **Fixed: text was escaped twice on the server.** A value with a `<` or an `&` was served as `a &lt; b` and shown
  so until the browser took the page over; through a component's children, escaped once more.
- **Fixed: `{props.children}` showed a list of strings as a list.** A JS library that gives a component its text as
  an array (`["text"]`) had it printed as JSON.
- **`rx-declare`:** a parameter that is a component is written `Component<P>`; one that is a view or a function
  giving one is written `View | (() => View)` (it was `ref message: View`, which made every call an instantiation);
  a prop that holds components in a record or a list is written so that the checker reads it.
- **`rx-lib`** refuses a signature that names, through `node_modules`, the component another package's fn renders
  beneath, as it refuses such a context.
- **Recorded, not filed:** solid-sonner 1.0.0's `toast.custom(fn)` calls `fn` with no owner; Kobalte 2.0.0-alpha.5's
  `toaster.show` is reachable only as a method of an exported object, so an app hands it out from a module of its own.

**File-based routers: the app around the router, and a layout's outlet** (spec/09 MO-14f, MO-11i, MO-1c; spec/archive/rfc-declaration-types-2026-11-22.md, *A ninth round*)

- **New: a host declaration says what the host renders *through*.** `host.d.rx` may import a component from a JS
  module — `import { AppRouter } from "./router.tsx"`, `import { Outlet } from "@tanstack/solid-router"` — and an
  `.rx` component that applies it then renders its record's children there, as `{props.children}` would. So:
  - **an `.rx` entry around the router is credited to the pages.** Name your app's component in the view, with the
    host's records as its children (`[{ component: App, children: [{ component: Root, … }] }]`): a context `App`
    provides and a region it has around `<AppRouter />` hold every page. It was `CONTEXT_NOT_FOUND` on a correct
    program, with no way to say it. The router's own context comes from the applied component's row
    (`export component AppRouter(props: {}) provides(router)`), so a hook in `App` above the router is still
    refused.
  - **a layout may render the router's `<Outlet />` itself**, as TanStack Router's documentation writes one. Its
    pages are checked where it applies the outlet.
  No word is added: an import row takes a second kind of module. Two routers write it (`examples/tanstack`,
  `bench/tasks/router-provider`; `bench/tasks/file-routes` on `@solidjs/router`).
- **New diagnostic: `NESTED_NOT_RENDERED`.** A component that a router's records (or a host declaration's view) give
  pages to, and that renders none of its children: a layout that forgot `{props.children}`, or an outlet `host.d.rx`
  does not import. **This closes a hole:** such a layout was accepted and its pages checked under nothing — a
  TanStack layout written with `<Outlet />` passed with every region removed. If your layout renders an outlet,
  add the import to `host.d.rx` (the message says which component).
- **Changed: strict mode asks for a host declaration's record.** `rx-tsc --rx-strict` refuses the view of every
  `host.d.rx` a module of the project is under, and each of its imports from JavaScript, until `rx-verify --record
  host.d.rx` has recorded them (`UNVERIFIED_ROW`). The declarations it imports from are held to their pins, records
  and types as any the program imports. `rx-verify` runs the new claim: the probe gives the real component as
  `through.Outlet`, the scene applies `rx.Outlet`, and a page must render inside it.
- **Fixed: a dependency's default component was checked as a mounted view** (spec/09 MO-1c). A module imported for
  a function or another component, whose default component relies on its caller's region, was refused where no one
  renders it. Only the entry's default component is mounted; any other is checked where it is applied.
- **Fixed: the reference parser did not end on a `}` that closes nothing** at a module's top level (the crate
  refused it; `ref/` read it again and again).
- **`examples/tanstack` is file-routed**, with a `host.d.rx`: TanStack's generated route tree types every `<Link>`
  and hook of the `.rx` pages, the layout renders `<Outlet />`, the entry provides a context above the router. The
  factory (a route tree written in `.rx`, given to a module of your own) is `examples/tanstack-factory`, unchanged.
- **Recorded, not filed:** TanStack's router generator has no option that admits an `.rx` route file (its physical
  scan keeps a fixed list of extensions; a virtual route config names any file, which it then parses as
  JavaScript). A TanStack route file stays a few lines of TSX.

**File-based routers: typed routes and the checks, together** (spec/09 MO-14, spec/11 CP-4d; spec/archive/rfc-declaration-types-2026-11-22.md, *An eighth round*)

- **New: a host declaration, `host.d.rx`.** A file-based router renders your `.rx` pages from JavaScript — a generated
  route tree, a manifest — where no `.rx` module shows the checker what is above them. Say it once, in `host.d.rx`
  beside (or above) your modules: import the components the host renders, and state its view in the words a
  factory's row has, `export default component provides(router) nests(children in component) = [{ component:
  Layout, children: [{ component: Home }, { component: Person }] }]`. A page is then checked among its layout's
  children, under the router: its failure needs the layout's `errored` region, a client-only build its `loading`
  one, and a hook whose context the view does not provide is `CONTEXT_NOT_FOUND` — each reported on `host.d.rx`,
  naming the page's read. It adds no word to the vocabulary. Two routers write it: TanStack Router's file routes
  (its Vite plugin, and TanStack Start) and file-system routes on `@solidjs/router` (`filesystem-routing`).
  guide/libraries.md, *File-based routers*, has both.
- **Typed routes are back for TanStack Router.** With the route tree the generator's, `<Link to>` and `useParams({
  from })` in an `.rx` page are typed by the registered router again; `bench/tasks/router-provider` moved from the
  factory to file routes, and the two type probes given up last round hold. The factory (a tree written in `.rx`,
  given to a module of your own) is unchanged (`examples/tanstack-factory`).
- **New: `?rx-page`** — `import Person from "./routes/people/[id].rx?rx-page"` is `?rx-lib` with the module's default
  component as the default export: what a router whose route files are `.rx` imports a route file as
  (`filesystem-routing`'s `extensions: ["rx"]` and `toRoute`). `rx-tsc` types it; `@reactivescript/runtime/rx-lib`
  has the pattern for a TypeScript without `.rx` support.
- **Changed: a module a host declaration imports has no mounted view.** Its default component is a route file's
  page, rendered by the host. Without a `host.d.rx`, nothing changes: a component JavaScript renders is checked
  under a root of its own in a whole-program build, as before — and so is every exported component the view does
  not name.
- **`rx-declare --host <modules…>`** drafts the file (the imports, the contexts those modules use, every component
  at the top; the nesting is yours to write), and **`rx-verify host.d.rx`** runs it against the scene a probe gives
  (`host.probe.mjs`): each page inside its declared layout, the router's hook working in each.
- **Fixed: `rx-declare` on a module named with its `.ts` extension** (`rx-declare ./router.ts`) wrote `any` where
  the module's types had a name: its own check refused the import.

**The vocabulary held to its bar, to the end** (spec/09 MO-8r *Settled*, MO-10l, MO-11r; spec/archive/rfc-declaration-types-2026-11-22.md, *A seventh round*)

- **Withdrawn: `renders(later)`, `renders` before a prop's type, `nests(component under parent)` and `outlet`**
  (MO-11o, MO-11p). One library wrote them, TanStack Router's code-based route tree. Each is refused by name in a
  `.d.rx`, with what to write. **What you write instead:** the route tree as records, given to a factory of your own
  — a few lines of JavaScript that build the library's routes from them and hand back the component that renders
  them, declared `Component provides(router) nests(children in component)`, the words `@solidjs/router`'s factory
  has (guide/libraries.md has the module; `examples/tanstack-factory`). A layout renders its
  pages as `props.children`. Every check the words gave still holds: a page's failure needs its layout's `errored`
  region, a router hook outside the made component is `CONTEXT_NOT_FOUND`. **What you lose:** TanStack's registered
  route types for a tree written in `.rx` (a link to no route is no longer a type error), and
  `COMPONENT_AS_VALUE` for a route tree that nothing renders. A page given to the library's own `createRoute` is
  checked under a root of its own (MO-11s), where the router's context is not found.
- **`RENDERS_ESCAPES` is no diagnostic any more.** The checks that kept a value "rendered where it is bound" (left
  from `renders` alone) and the walk that followed components carried in values are deleted from both checkers, with
  a printed signature's `keeps(…)` and its `renders` on a prop. `RESULT_AS_VALUE` stays.
- **New: an accessor that waits or fails says so** — `pending` and `fails(…)` before a `ref` part of a declared
  result (spec/09 MO-10l): the whole result (`createJson(url): pending fails(Error) ref User`), an item of its tuple,
  a field of its record (`{ data: pending fails(Error) ref T; refetch: () => void }`). A reader bound from it is
  checked as a value from an `await` is: its reads need an `errored` region above them (`UNHANDLED_FAILURE`) and, in
  a client-only build, a `loading` one (`ASYNC_OUTSIDE_LOADING_BOUNDARY`); a record or a tuple with such a part is
  read a part at a time (`RESULT_AS_VALUE`). A plain `ref` asks for nothing, as before. It is the multi-library form
  of the field words withdrawn last round: three libraries' rows write it (solid-use's `fetch().json()`;
  solid-primitives' `createSSE`, `createGeolocationWatcher`, a GraphQL query; TanStack Query's `data` through a hook
  of your own), and the five checks the query tasks gave up are back. Before a plain field the words are still
  refused, now with this form as what to write.
- **`rx-declare`** no longer drafts a placement word for TanStack Router: its context, hooks and provider only.
- **`rx-verify`** reads a `pending`/`fails(…)` `ref` part as declared, runs `fails(C)` with the probe's failing
  arguments, and points out an accessor that waited without saying so (no mismatch: the row says less). Its placement
  checks are a factory's and `nests(children in component)`.
- **Decided, and not taken** (MO-8r): an element in a record given to a *fn* (`createPagination({ prevContent })`)
  and a table cell that reads the app's context. One library asks for each; a string, or the cell's props, stand
  there.
- The tree-sitter grammar reads `nests(… in …)` alone and no `renders`, `outlet` or `keeps(…)`; the bench's coverage
  entries may hold bad variants of their own (`bad` in `use.mjs`, a `bad caught` column in the record).

**What the fifth round left open, settled** (spec/09 MO-8r *Settled*, MO-11t, MO-12e; spec/archive/rfc-declaration-types-2026-11-22.md, *A sixth round*)

- **An element in a prop**: a component of yours given by name to a JS component's prop typed `View` —
  `<Key each={rows} by="id" fallback={Nobody}>`, `<ClientOnly fallback={Measuring}>` — is applied there with no
  arguments (JSX's `fallback={<Nobody />}`), and checked as the library's children are (spec/09 MO-11t). It was
  `COMPONENT_AS_VALUE`, and the fallback had to be a string. `rx-declare` drafts such props.
- **A wrapper around a library's hook names the library's context**: `export context queryClient from
  "@tanstack/solid-query"` in the `.d.rx` of a module of your own, then `uses(queryClient)` on its hook. The hook
  outside the library's provider is `CONTEXT_NOT_FOUND` again; it was not checked behind a wrapper (spec/09 MO-12e).
- **Withdrawn: `pending` and `fails(…)` before a declared result's field** (MO-10f). One library wrote them (TanStack
  Query's `data`), and no other library of the 190 modules covered hands out a store whose plain fields wait. A row
  that writes them is refused, with what to write: hand the field out as a function from a module of your own and
  declare it `ref` (guide/libraries.md has the six lines). **What you lose:** the checker no longer asks for a
  `loading` and an `errored` region above a query's `data`; an accessor asks for none (spec/09 MO-10d), as every
  other library's waiting value already did. An `.rx` component's prop may still be typed with the words on its
  fields.
- **Withdrawn: `renders` alone after a fn** (MO-11l: "rendered where its result is bound"). One library wrote it (a
  table, through an adapter). Leave the word out: the components the fn is given are checked each under a root of its
  own, the result is a plain value. **What you lose:** a cell component can no longer read a context of your app;
  give it what it needs through the table's cell context.
- **`renders(later)`, a prop's `renders`, `nests(component under parent)` and `outlet` are one library's** (TanStack
  Router's code-based route tree). The second library claimed for them, UI SDK's `toast()` and `<OverlayHost>`, was
  declared and used: it needs no word (`bench/coverage/ui-sdk/overlays`). They fail the bar and are to be
  withdrawn in a change of their own (it rewrites the TanStack Router example and task onto a factory of the app's
  own); they still parse, and no new row should write them.
- **A primitive's own owner, specified to the end** (spec/09 MO-10a): its cleanups run when the place it is written
  goes, the primitives' before the component's own; a failure while it is made, or later in what it made, reaches
  the `errored` region its caller is under. `runtime/test.mjs` and `compiler/test/confined.mjs` hold both.
- **`rx-verify`**: a plain field that waits or fails where it is read is a mismatch, with what to write (it asked for
  `pending`); a `ref` part that holds is not one.
- CI: the benchmark ran 31 minutes in one job once the coverage suite joined it; it is four jobs now (the tasks, and
  the coverage suite in three shards, `node bench/run.mjs --coverage-only --shard i/3`).

**Four libraries, whole** (spec/archive/rfc-declaration-types-2026-11-22.md, *A fifth round*; bench/coverage/)

Every `@solid-primitives` package on Solid 2 (98), every module of `solid-use`, and each family of Wardic and UI SDK is
now drafted whole by `rx-declare` and used by a program the suite checks, types and runs: 190 modules, 4877 rows, no
`any` of the draft's own; 120 programs. No word was added to the notation. What changed for an app:

- **A primitive from JavaScript runs in an owner of its own** (spec/09 MO-10a). A library whose server render makes
  fewer effects than its browser one (`if (isServer) return …` — sixteen of the first twenty-five solid-primitives
  packages tried) shifted the hydration keys of everything written after it: `Hydration key miss`, in an `.rx` app as
  in a `.tsx` one. It hydrates now. The call is also untracked, and a `ref` argument that is a constant is passed as a
  plain `() => "a.mp3"` rather than a memo, so a library that reads a parameter once while it is made no longer trips
  Solid's `STRICT_READ_UNTRACKED` against your component.
- **`rx-declare` drafts more of what libraries write**: a record inside a tuple result, a value-or-function option, a
  render prop generic in what it gives, Solid's own getter type as an accessor. A function of nothing that answers
  `Promise<void>` (`exit`, `requestPermission`) is a function now; it was drafted `ref`, which would have called it on
  a read.
- **`rx-verify rx-types/<package>.d.rx`** runs a project's declaration against the package it declares (it said "no JS
  module beside"), so `rx-tsc --rx-strict` can be used with them.
- **`rx-lib`**: a module's scoped stylesheet is imported by the browser entry it builds (nothing linked it); a
  signature that names another package's context through `node_modules` is refused, with the module and the key.
- **`?rx-lib` modules** (a JS host's `import { Page } from "./pages.rx?rx-lib"`) keep their module state for the page or
  the request, not for the first component that rendered them, and their ids are the server's (spec/09 MO-13h).

Shapes that still have no row, and what to write instead (guide/libraries.md): a function a primitive hands back that
the view calls (give it as a field of a record), a class you construct, one function that is two things by how it is
called, a component that is a part of a result. An element in a prop that is not `children` (`fallback={…}`) was
accepted here as the next form — a component with no props given by name — and is the first entry above.

**The vocabulary of a declaration, pruned** (spec/09 MO-8r)

A word or a form of a `.d.rx` is kept only if, without it, a correct Solid program people commonly write cannot be
written, or a mistake Solid programs really make cannot be refused — for more than one library. What one package does
is said without a word: leave the function undeclared, write a few lines of JavaScript of the app's own and declare
those, or let the library's own types say it (guide/libraries.md, *When no word says what a library does*). Eight
went, none of them released; a row written with one is refused by name, with what says it now.

- `signal init: T` on a parameter: make the signal in a module of your own, `export const persisted = (init, o) =>
  makePersisted(createSignal(init), o)`. It was the one word that changed the compiled call (`__rt.signal` is gone
  from the runtime).
- `tracked` before a function type: leave it out. A function type without `handler` was already read as that.
- `forwards` after a signature: leave it out. A `pure` fn that makes nothing hands the components in its arguments on
  to the factory it is written in.
- `joins(path)` beside `nests(…)`: leave it out. A page under a route that has the param declares it optional, as in
  TSX.
- `methods(m, …)`: write `peek` where a method's answer is read once (`routeTree: peek rootRoute.addChildren([…])`).
- `renders(root, ctx…)`: leave it out. A fn that says nothing of where it renders what it is given is read so.
- `trusted`: gone. Strict declarations (`--rx-strict`) have no opt-out in a row.
- Several rows of one fn's name: one row. A fn with several signatures is declared by one of them, and your calls are
  typed by the library's own overloads.

**Fixed**

- `<wardic.div>` — a tag that begins with a small letter and has a `.` — was compiled, with no diagnostic, as an HTML
  element named `wardic.div`. It is `UNKNOWN_COMPONENT` in both checkers, and the message gives the spelling that
  works: `import { wardic as Wardic }`, `<Wardic.div>` (spec/09 MO-11q).
- `rx-declare` fails, with the line and the parser's reason, when the crate cannot read the draft it wrote. It wrote
  `any` for every row and said so only under `--explain` (a `readonly` prop did that to a whole library: 726 `any`s).
- What `rx-declare` names of a dependency's types no longer depends on how npm laid the install out. A type of a
  package the library depends on (`import("@solid-primitives/utils").Many<T>`) was looked for from the app's folder,
  so it was named where npm had hoisted that package and written out where it had not; it is found from where the
  library is installed now, and `rx-tsc` resolves what a row names the same way (spec/09 MO-8o). The benchmark
  installs from a lockfile (`bench/package-lock.json`, `npm ci`), so a local run and CI have the same tree.

**New**

- A library written in `.rx` can be published and used from `.rx` apps and from `.tsx` Solid 2 apps (spec/09 MO-13).
  `rx-lib` (`@reactivescript/compiler`) builds a package: each module compiled for the browser and the server, the
  module an import resolves to on each side, the printed signature as its `.d.rx`, the projection's types
  (`x.rx.d.ts`) and the types of the JavaScript (`x.d.ts`), and it holds the package.json's `exports` to that layout
  (`--write` writes them). An `.rx` app is checked against the shipped `.d.rx` as against the package's source; a
  `.tsx` app gets TypeScript's checks only. The runtime has `library(factory, name)` for the JavaScript side.
- A package's module has one instance in a page, whoever imports it (spec/09 MO-13g): an `.rx` program and a `.tsx`
  host that both import it share its state (they had an instance each). `library` and `components` bind to the page's
  app — the first app made in the page; the app the runtime makes for JavaScript is the one a program's `createApp`
  then returns. A second `createApp` in a page is still a second app.
- On the server, a `.tsx` app that uses an `.rx` package (or `?rx-lib` components) renders with a plain
  `renderToString` or `renderToStream`: outside Solid's request event the state is the render's, found through the
  owner, never shared by two renders. It threw before. Used where nothing renders and no request is answered, it still
  throws, and the message says what to do.
- In a request event, a package's state lives as the request does (spec/09 MO-13g). It was under the first render's
  root: a second render of the same request (a head rendered apart, a `renderToString` inside a stream) read nodes
  the first had disposed. Now each render of the request holds the state, it is disposed when a turn of the event
  loop passes with none open, and a render that begins after that throws, saying why. `holdRequest()` (new, server)
  holds it across an `await` between two renders.
- What the server runtime reads of Solid's internals to find a render's root owner is in one file
  (`ref/compile/solid-internals.ts`), checked against Solid's public `getHydrationWriter()`: a Solid shaped otherwise
  is refused with an error naming its version, where it would have been one app for whatever owner was topmost.
  `runtime/test.mjs` asserts those internals (CI runs it). A package export used under a root made outside any render
  and any request now throws as any use outside a render does (it took the topmost owner for a render).

- A package's module that JavaScript uses first is instantiated in a root no owner holds, whose id is the module's
  name (spec/09 MO-13h): it is not disposed with the component that first read it, and its nodes have the server's
  ids wherever the first use is.
- A `.d.rx` that begins `//@ signature <module>.rx` is the printed signature of a compiled `.rx` module, and is read
  as one wherever a JS import finds it (beside a relative module, or a package's): absent `rejects(…)` is nothing,
  sources, equations, actions, contexts with relative keys, `catches`, `shape(…)` are the signature's. The compiler
  writes the line on every signature it prints (the header comment it wrote before is gone). A `.d.rx` without it is
  a JS module's declaration, as before. The tree-sitter grammar reads such a file.

**Changed**

- The record after a component's props' type is held to that type (spec/13 TY-6f, 09 MO-8o). `props: P & { onChange?:
  handler (v: Option) => void }` was checked as `P & NoInfer<{ … }>`, which an intersection satisfies whatever the record
  says. `rx-tsc` now checks each field of the record on its own: it names a prop the type has, and the type it is written
  with is one the library's type for that prop takes (the same, or narrower). Otherwise `DECLARATION_MISMATCH` on the
  row, naming the prop and both types. A declaration with a retyped or misspelt field in such a record, accepted before,
  is refused.
- `rx-declare` writes no `any` of its own for a module with types, for any export (spec/09 MO-8q, extended): a type
  parameter's bound is written out however long, a part with no name is its place at the row's type parameters
  (`Parameters<typeof import("kit").f<T>>[1]`), a predicate is written as the library writes it, options a row cannot
  write field by field are the type the library declares, a result the library calls `JSX.Element` is a component's
  though the app's project cannot resolve it, a function of nothing that gives an element is `() => View`, and a row
  with a bound that has no name is its last signature with each such part by its place. `--readings <export>` prints
  each reading of a row and TypeScript's answer. The library's own `any`s inside a type it names are reproduced (they
  were counted against the row, which then dropped the type). `bench --check` drafts every export of each module its
  tasks declare and fails on an `any` of the draft's, or on more parts said by place than the scorecard records.
  Generated declarations are redrafted (draft 6).
- The tree-sitter grammar reads a member of an import type, `import("pkg").Types["error"]`.
- A declared component's props may be a type, with the fields that carry words in a record after it (spec/09 MO-8o):
  `export component Dialog(props: import("@ui-sdk/solid/dialog").DialogProps & { onOpenChange?: handler (open: boolean,
  details: DialogOpenChangeDetails) => void }) provides(dialog)`. The checker reads the record as it read a record of props; a
  prop it does not list is passed as any undeclared prop is. TypeScript reads the intersection; the boundary check
  (TY-6) finds the row's type parameters from the type alone. Props that are a union of records are written as they are.
- `rx-declare` writes a row's types from the library's own declaration (spec/09 MO-8o): the annotation of each parameter,
  result and prop, with every name rewritten to a module the app can import it from — any subpath the package exports
  (`@formisch/solid/v2/internals`), the packages it depends on — under the name it has there (a bundle's `Store$1` is
  `BaseStore`). A result the library names is written by that name unless its parts say something the checker reads; a
  component's props are its props type and the fields that carry words; a fn with several signatures has a row for each;
  a generic method is written at its type parameters' defaults. Generated declarations are redrafted (draft 5).
- `any` is the library's, or it is not written (spec/09 MO-8q): a `.d.rx` holds `any` only where the library's own type
  has it, reproduced as it is; `unknown` stays `unknown`. `rx-declare --explain` reports the library's `any`s and the
  draft's apart, with the parts said by place; `--causes <file>` writes them by row. `bench --check` counts inherited
  and introduced `any`s and by-place parts for each task, fails on an introduced `any` that is not on
  `bench/any-allowlist.json`, and on any of the numbers rising.
- A declared component may have type parameters, as a declared fn may (spec/09 MO-8d): `export component
  Picker<Option>(props: { value?: Option; options: Option[]; onPick?: handler (v: Option) => void })`, on a member
  component too. It was a parse error, so a generic component's props could only be `any`. The checker reads none of
  it; the declaration's `.d.ts` and the boundary check (TY-6) carry it.
- `rx-declare` names a library's types where it wrote `any` (spec/09 MO-8m): another package's type by
  `import("<package>").T`, the module's own by an alias with its bounds, a row's type parameters as the library
  declares them, a callback by its own signature, a conditional or mapped type as the library computes it, an internal
  type by its place. Each row is checked against the module before the draft is written, and one TypeScript does not
  hold is written as before, so a draft passes `rx-tsc` as it stands. `--explain` says why each `any` left is one;
  `--any` drafts as before. Generated declarations are redrafted (draft 4).
- `rx-declare --source [<checkout>]` reads the library's own TypeScript source — a checkout, the `src/` the package
  publishes, or the sources its source maps carry — and writes what it shows of the words types cannot (`handler`,
  `ref`, `uses`, `provides`, `instantiates`, a result that undoes the call; a callback called inside a computation,
  which takes no word) as `// SOURCE` comments above
  the rows, each with its file and line (spec/09 MO-8n). It never writes a word into a row.
- Values the checker confines have a closed set of operations (spec/09 MO-10k, spec/08 CN-7d). A JS result whose
  fields wait or fail is read by the fields its declaration names: `q.valueOf()`, `q.toJSON()`, an undeclared field and
  `q[k]()` are `RESULT_AS_VALUE`. What is called on a library's draft is a method of plain data; a callback given to one
  (`d.items.forEach((row) => { … })`) has parameters that are places of the draft, an iterator read out of one is kept
  as an iterator over copies, and any other method is `DRAFT_ESCAPES`. A method keeps nothing of a `renders` value only
  when it is given no part of that value. A call through a record, an array or a call
  (`box.read()`, `fs[0]()`, `mk()()`) reads what the closures it may call read (`SNAPSHOT_KEPT`, `SNAPSHOT_ARGUMENT`).
- `@rx-types/solid-js` (in `declarations/solid-js`): the declaration of Solid itself, found as an `@types` package is
  (09 MO-8k): `createStore` with its draft setter, `snapshot`, `merge`, `omit`, `flush`.
- `rx-declare` types a result a step at a time: a disposer as `() => void`, a small object by its fields (an accessor
  `ref`, a function by what it answers), a class instance by the methods that answer nothing or a promise; an accessor of
  an options object lists its callbacks; the module's own types are named; a generic type is declared with its
  parameters. Generated declarations stay types-only.
- A function field of a declared result that answers a promise (`mutate`, `refetch`) and is not awaited in reactive
  scope is `IO_IN_REACTIVE` (09 MO-10b): `{rename.mutate(v)}` in a view started the mutation on every computation.
- A `draft(…)` equation with a declared type types its draft by it (`sel: Record<string, boolean> = draft({}) { … }`
  was a TypeScript error on `d[k]`).
- A function a context provides or a prop is given is read by its declared type, as a method of a JS result is (09
  MO-10b): one that answers nothing (`add: (id: string) => void`), or a promise of nothing, is called for what it
  does, so `{c.add(id)}` in a view and `onClick={c.add(id)}` are refused — `ACTION_CALLED_IN_OWNED_SCOPE` where every
  provision the module writes gives the field an action, else `IO_IN_REACTIVE`. A prop declared a primitive
  (`title: string`) holds no part of a confined value.
- `GUESS_OUTSIDE_HOLD` also refuses a guess in a run that starts nothing to wait for (06 AC-3): no `await`, `refresh`,
  `affects`, write or call of its own, so the guess would be taken back in the instant it is made. New advice,
  `GUESS_AFTER_AWAIT`: an action's first guess written after an `await`.
- `MUTATION_IN_PLACE` covers what a JS component hands its view (`view (list) { … }`): the library's own state.
- A render prop declared optional (`children?: (items: T) => View`) may be left out: `<Select.Listbox />`.
- Writing through a row found in a store's draft (`let t = d.items.find(…); t.done := true`) is still refused — the
  local is a copy — and the message now says so and gives the two ways to write the row.
- A value `renders` checked where it is bound may be given to a component that keeps it (09 MO-11l): shadcn/ui's
  `<DataTablePagination table={table} />` is accepted. A component keeps a prop when its body lets no value that may
  hold a part of `props.<field>` out (a prop of a component that does not keep it, a provision, a source, an export, a
  thrown value, a call that may keep it); its signature says so, `keeps(table)`, for importers. A component that lets
  it out is still `RENDERS_ESCAPES`, at the application, with the line where it leaves; a JS component never keeps.
- A closure given to a closure is called by it (02 E-10): `pick = (o) => o.total()`, then `createStamp(pick(fmt))`,
  reads what `fmt.total` reads, and so does `apply = (g) => g()` given `total`, a parameter handed on to another
  closure, and a closure the callee gives what it reads. These froze a value; they are `SNAPSHOT_ARGUMENT` /
  `SNAPSHOT_KEPT`. A slot the argument's literal names stays that slot (`(o) => o.name` reads no closure).
- A closure's parameter may have a function type: `(g: () => string) => g()` (it was a `PARSE` error).
- The loop `for (const x of xs) { … }` visits what `xs` held when it started, as the spec said; it compiled to a loop
  over `xs` itself, which a turn could lengthen.
- A record result with no accessor part is the library's own object, not a copy with a getter per declared field.
- A declared fn whose result hands out drafts (`createStore`) is a primitive: its setter is io.
- `catch` follows only an `await`: `await f(x) catch (e) => alt` makes a matching rejection the answer. A `catch` after
  anything else is the new compile error `CATCH_NOT_ON_AWAIT` (R-f-4). Show a failed value with an `errored` region
  where it is read; in a handler or action, read it inside `try { … } catch (e) { … }`; write validation as a value
  (`""` or a message), not a thrown class.

**Fixed**

- A declared component's prop may be `readonly` (`export component Group(props: { readonly id?: string })`, spec/09
  MO-11a): it was a parse error, and `rx-declare` then wrote every row of such a library with `any` (Wardic: 726).
- `bench/`: Kobalte's two tasks are gone for now, and three libraries are in: `ui-sdk-dialog` (`@ui-sdk/solid`),
  `wardic-motion` (`@wardic/solid`) and `solid-use-primitives` (`solid-use`). `compiler/test/kobalte.mjs` and
  `examples/kobalte` are `compiler/test/wardic.mjs` and `examples/wardic`. What the three libraries' declarations
  could not say is in `spec/archive/rfc-declaration-types-2026-11-22.md` (*A fourth round*).
- `compiler/test/vite.mjs`: the dev servers poll for changes. "styles (dev): after the edit" failed on macOS, where the
  file watcher reports a project copied just before the server started as a late burst and drops an edit made then.
- `affects` on a keyed or structured source that takes a guess threw `INVALID_AFFECTS_TARGET` in a dev build, so the
  action never reached its `await`, and did nothing in a production build, so `pending?` stayed false (#50,
  S-affects-keyed).
- A keyed source that takes a guess (`source rows key id = q.rows`) merges each answer by key instead of replacing every
  row, so a row's readers re-run only when its own leaves change (#51).
- The guide's action example (`guide/async.md` §3) lost an error thrown before the first `await`: the `onFlush` clear
  ran after the catch. The catch now writes the error through `onFlush` as well (#52).
- A `catch` expression read with no observer (a component `fn` called from a handler or an action) built a fresh error
  boundary, which had no value while a `refresh` was out, so the click threw `NotReadyError` and was lost. It is now a
  snapshot: the committed value, or the alternative on a matching failure (R-8, S-catch-snapshot).

**New**

- `bench/`: a representative-task benchmark over the Solid ecosystem's libraries (Formisch, TanStack Query, Router,
  Start and Table, UI SDK, Wardic, solid-use, Solid's store). Each task is a good program (accepted by both checkers, typed by the
  library's types, run in Chromium) and one-line mistakes that must be refused. `node bench/run.mjs`; CI holds the
  scorecard.
- A whole query result can be passed to a component whose prop's type keeps the fields' rows:
  `props: { query: { data: pending fails(Error) T; status: string } }` (MO-10f).
- A component that gives a prop on to a provider that renders it (`<RouterProvider router={props.router} />`) renders
  it in turn: a router can be wrapped in the app's own frame, in any module (MO-11o).
- A store updater can have a name: `bump = (d) => { d.done := d.done + 1 }`, then `setTodos(bump)` (MO-10i).
- A part of a `renders` value that its declaration types as a primitive (`getPageCount: () => number`, a row's `id`)
  is passed to a child or a callback as it is, with its type (MO-11l).
- `MUTATION_IN_PLACE` (W-1a): `rows.push(x)`, `props.items.sort()` and the like on the value of a source, an equation,
  a prop or a row.
- `DISPOSER_DROPPED` (EF-5a): a declared JS call whose result is `() => void`, dropped. The type is read through a
  name its declaration file gives it (`export type Unsubscribe = () => void`) and TypeScript's `VoidFunction`; a
  subscription object counts (`{ unsubscribe: () => void }`, and `dispose`, `destroy`, `disconnect`, `stop`, `cancel`,
  `close`); and the local it is bound to must be used on every path (`if (on) { return () => { stop() } }` drops it
  where `on` is false; `let later = stop` keeps it only as far as `later` is used). `rx-declare` drafts such a result
  as `() => void`.
- `DUPLICATE_KEY` (ST-4d): two rows of a keyed list written with one key.
- A handler attribute given a call of something io (`onClick={save()}`) is refused (SC-4); a method declared to answer
  nothing is io where the view computes (MO-10b).
- A component a JS host renders (`?rx-lib`) is checked under a root of its own in a whole-program build (CP-4d).
- Advice: `rxc check` lists `advice` beside its diagnostics, never an error. `ASYNC_WATERFALL`: a question awaited
  after another whose answer it does not read.

- `ARGUMENT_COUNT` (AC-1f): a call of an action declared in the module with another number of arguments than its
  parameters is refused.
- `props` in a component declared without props (`component C()`) is `UNBOUND` (RG-4b); it read `undefined`.
- `guide/async.md`: "One store over the server"; the `GUESS_WHILE_LOADING` advice says what holds when a selection
  changes while a guess is out (05 DV-22).

## 0.3.1

**New**

- Spread attributes in markup, `<button {...rest}>` and `<Inner {...rest} />`, lowered to Solid's spread and `merge`:
  later attributes override, and each field keeps updating (07 §4, S-surface-5).

## 0.3.0

`@reactivescript/compiler`, `@reactivescript/runtime`, `@reactivescript/language-server` and the editor extension,
together.

**Breaking**

- `UNGUARDED_SNAPSHOT` (R-8) is stricter: an `errored` region or `disabled` covers a failure only when it reads the
  value. A region whose content reads `x` only under `pending? x` never shows its fallback, so it no longer counts
  (#58).

**New**

- Solid libraries (MO-10): declare a primitive once in a `.d.rx` (`export pure fn createToggle(v: boolean): [ref
  boolean, (v: boolean) => void]`) and use it like .rx: it is called once, `ref` arguments go in as accessors, readers
  are read without a call, and setters are io. A package's `.d.rx` sits beside the file its import resolves to.
  `guide/libraries.md` (#57).
- The guide (shipped in `@reactivescript/compiler`) places data by its lifetime: what a visit, a write or the screen
  needs, with a module only for data whose writes outlive their page (#58, #59).

**Fixed**

- `refresh` of a keyed equation re-asks it. It used to re-ask nothing in compiled code (#58).

## 0.2.0

`@reactivescript/compiler`, `@reactivescript/runtime`, `@reactivescript/language-server` and the editor extension,
together.

**Breaking**

- `optimistic` is now `guess` (`guess todos := …`), and errors clear with `onFlush` (#47). `optimistic` is no longer
  a keyword.
- A new check, `GUESS_WHILE_LOADING` (AC-3a): a guess written before its value has been shown is an error (#53).

**New**

- `rx-tsc`, in `@reactivescript/language-server`: TypeScript's `tsc` with `.rx` files in the program, for CI (#41).
- `else if` in markup: `{if a { … } else if b { … } else { … }}`.
- A guess over an equation, as Solid's `createOptimistic(fn)` (#48).
- Destructuring (RG-4b): live in declarations, a snapshot in `let`, with rest (#49).
- Parse errors are coded and name the JS or React habit they come from; every code has a page in
  `guide/diagnostics.md`, linked from Vite, `rx-tsc` and the editor (#42).

**Fixed**

- A relative JS import (`import pure { f } from "./util.js"`) compiles to an ES import. It used to fail as "not in
  the scenario prelude", so a package.json `#imports` alias was needed. `./api` is still the app's injected API.
