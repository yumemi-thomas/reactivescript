# Changelog

## Unreleased

**File-based routers: the app around the router, and a layout's outlet** (spec/09 MO-14f, MO-11i, MO-1c; spec/rfc-declaration-types-2026-11-22.md, *A ninth round*)

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

**File-based routers: typed routes and the checks, together** (spec/09 MO-14, spec/11 CP-4d; spec/rfc-declaration-types-2026-11-22.md, *An eighth round*)

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

**The vocabulary held to its bar, to the end** (spec/09 MO-8r *Settled*, MO-10l, MO-11r; spec/rfc-declaration-types-2026-11-22.md, *A seventh round*)

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
- **`rx-declare`** drafts the words where it knows them: for a release they were read off (`known.js`:
  `@solid-primitives/sse`'s `createSSE`, `@solid-primitives/geolocation`'s `createGeolocationWatcher`), and with
  `--run` for a hook it could run whose accessor's first read is not ready (`pending`; `fails(…)` is yours to add).
  It no longer drafts a placement word for TanStack Router: its context, hooks and provider only.
- **`rx-verify`** reads a `pending`/`fails(…)` `ref` part as declared, runs `fails(C)` with the probe's failing
  arguments, and points out an accessor that waited without saying so (no mismatch: the row says less). Its placement
  checks are a factory's and `nests(children in component)`.
- **Decided, and not taken** (MO-8r): an element in a record given to a *fn* (`createPagination({ prevContent })`)
  and a table cell that reads the app's context. One library asks for each; a string, or the cell's props, stand
  there.
- The tree-sitter grammar reads `nests(… in …)` alone and no `renders`, `outlet` or `keeps(…)`; the bench's coverage
  entries may hold bad variants of their own (`bad` in `use.mjs`, a `bad caught` column in the record).

**What the fifth round left open, settled** (spec/09 MO-8r *Settled*, MO-11t, MO-12e; spec/rfc-declaration-types-2026-11-22.md, *A sixth round*)

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
  `compiler/test/ssr-held.mjs` is gone with the form it ran.

**Four libraries, whole** (spec/rfc-declaration-types-2026-11-22.md, *A fifth round*; bench/coverage/)

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
  parameters. For `@tanstack/solid-router`, `@solidjs/router` and `@tanstack/solid-query` it also drafts what types
  cannot show (`renders(later)`, `nests(…)`, contexts, `pending fails(Error)`, `handler`, `pure`), from
  `src/known.js`, for the version range each entry was checked against. Generated declarations stay types-only.
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
  could not say is in `spec/rfc-declaration-types-2026-11-22.md` (*A fourth round*).
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
