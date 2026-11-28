# bench — the representative-task benchmark

ReactiveScript's goal is to be the best way to use the whole Solid ecosystem
while making wrong Solid code difficult to write. The scenarios and the unit
tests check rules one at a time; this suite checks the goal: a list of jobs a
Solid user does with the ecosystem's libraries, each written the way that
user would write it, and for each job the mistakes they would make.

```sh
node bench/run.mjs                 # the scorecard
node bench/run.mjs table query     # some tasks
node bench/run.mjs --check         # compared with bench/scorecard.json: a green check may not turn red (CI)
node bench/run.mjs --check --strict  # and every failure is one its task's `known` gives a reason for
node bench/run.mjs --write         # write bench/scorecard.json and bench/scorecard.txt from this run (and the coverage suite's record)
node bench/run.mjs --tasks-only    # the tasks alone; --coverage-only: the coverage suite alone (below)
node bench/run.mjs --coverage-only --shard 2/3   # the coverage suite's second third: CI runs it in three jobs beside the tasks
```

It needs the crate (`cargo build --release` and `npm run build` in
`compiler/`), the runtime (`npm run build` in `runtime/`), the language
server's packages (`npm ci` in `tooling/rx-language-server`), Node 22.6 or
later, and the network once: `bench/package.json` is installed into
`bench/.out/ws` from `bench/package-lock.json` (`npm ci`), with this
repository's compiler, runtime and language server linked in as an app would
install them (a task with a `package.json` of its own beside its `task.mjs`
has an install of its own, from the lock beside it, for a library the workspace
cannot hold: `router-rx-routes`' fork of TanStack Router's generator and plugin,
whose `vendor/` folder holds the packages the lock names by file — a library's
fork, packed, each with its integrity in the lock. Kobalte 2 is linked as Solid
is, from `../kobalte`, its `solid2` branch at `ref/KOBALTE` built against the
pinned Solid by `ref/scripts/kobalte.sh`). The lockfiles are what make
a run the same on every machine: an install npm resolves on its own hoists what
it likes, and a number once moved with it (a draft named a dependency's type
where npm had hoisted that package, and wrote it out where it had not; 09
MO-8o now has it found from the library's own location). To change a
library, edit `package.json` and remake its lock in a copy of the folder:
`npm install --package-lock-only --legacy-peer-deps`. `scripts/setup.sh` builds all but the
last.

## What a task is

A folder under `tasks/`: `src/` is the app, `task.mjs` says how it is judged.

- **The good program** (`src/`) is a realistic job: the libraries are the
  ones npm has (Solid 2.0, Formisch, TanStack Query, Router, Start and Table,
  UI SDK, Wardic, solid-use, Kobalte — and, in one task, TanStack Router's generator from a fork, packed: `tasks/router-rx-routes/vendor`), imported by their own names, declared in `rx-types/` as a project
  declares a package that ships no `.d.rx` (09 MO-8k), and typed by the
  library's own TypeScript types. Solid itself is declared by the shared
  declaration this repository ships (`declarations/solid-js`, copied into the
  workspace as `@rx-types/solid-js`, the way an app installs it).
- **The bad variants** are that program with one line changed into a mistake
  a Solid user makes: a read with no boundary, a value frozen where it should
  follow, a write while the view computes, a value that escapes where the
  library checked it.

and five columns score it, with two numbers beside them:

| column | green when |
| --- | --- |
| **good accepted** | the crate and `ref/` both accept the program, and agree |
| **types kept** | `rx-tsc` is clean with the library's own types; the `.rx` writes no `any`; and each *type probe* — a mistake only the library's real type can refuse (a field path the schema has not, a link to no route) — is refused by TypeScript **on the line the probe wrote** (an error elsewhere is not the type refusing the edit). A probe that passes means the type was lost on the way |
| **runtime ok** | the compiled program does the job: rendered on the server and/or driven in Chromium on Solid's development build, with no console error or warning |
| **unrepresentable** | the variants the language has no way to write: refused by the parser, by name resolution or by TypeScript alone (`PARSE`, `ASSIGNMENT`, `UNBOUND`, `UNKNOWN_COMPONENT`, a JS habit's code, a `ts` variant). They show that a mistake cannot be spelled, not that a check of the program's meaning caught it, so they are counted apart from the next column |
| **bad caught** | each variant is refused by both checkers, with the diagnostic named, by a diagnostic the good program does not have. Where only the run can know (a duplicate key computed at run time), the variant must compile and then fail loudly in development (`dev`); where only running a declaration can know (a `pure` JS function that answers differently on the server, 10 SV-7c), the checkers must accept the program and `rx-verify` refuse the row (`verify`); a declaration that has fallen behind what it was derived from (09 MO-14g) is refused by `rx-tsc`'s own gate (`gate`) or by the build (`build`), and a variant may add a file (`add`: a route file a router finds); where the language makes the mistake harmless instead of refusing it (a draft's row kept by a callback is a copy), the variant may compile and must then behave (`orSafe`); advice that never fails a build is `advise` |

| number | what it counts (lower is better) |
| --- | --- |
| **hand-written `.d.rx` words** | for every `.d.rx` of the task, the words a person wrote on top of what `rx-declare` drafts for the same module. A row the draft has word for word costs nothing, a row it has otherwise costs the words that differ, a row it has not costs every word; rows left out cost nothing. It is what an app pays to use the library |
| **`any` inherited** | the `any`s those files hold that the library's own declaration has at that place (09 MO-8q): for an export, as many as `rx-declare`'s draft of the same export writes for the library's own (`rx-declare --causes`, cause `vendor-any`). They are reproduced, not narrowed |
| **`any` introduced** | every other `any` those files hold: written where the library has a type. It must be none. One that cannot be named yet is listed in `any-allowlist.json` — the task, the file, the export, how many, a one-line reason and what blocks naming it — and nowhere else |
| **by-place** | the parts those files say by their place in the library's declaration (`Parameters<typeof import(…)>`, `ReturnType<…>`): a type in name only, counted apart so that it is not a way around the rule above |

`BENCH_WORDS=1 node bench/run.mjs <task>` prints each row written by hand beside the draft's row of the same export:
what a person added.

`--check` holds these numbers too: a task's declarations may not need more hand-written words, hold more `any`s (of
either kind, or together), nor say more parts by place, than `scorecard.json` records; an introduced `any` that is not
on `any-allowlist.json`, or more of them than its entry allows, fails; so does an entry that no longer holds one.

**Whole drafts.** A task's `.d.rx` keeps the rows its app uses, which is a small part of a library. So the suite also
counts the same three numbers over what `rx-declare` drafts for *every* export of each module a task declares (the draft
it already makes to measure the hand-written words): the `any`s that are the library's own, the ones the draft wrote
where the library has a type, and the parts said by place. They are in `scorecard.txt` under *Whole drafts*, draft by
draft, and in `scorecard.json` as each task's `decl.draft`. `--check` holds two of them (09 MO-8q): an `any` of the
draft's fails unless `any-allowlist.json` has an entry for it — `task`, `draft` (the module), `name` (the export),
`count`, a one-line `reason` and what is `blocked` — and a task's whole drafts may not say more parts by place than the
scorecard records. The library's own `any`s are the library's: they are counted and not held (naming more of a
library's types reproduces more of them). The allowlist is empty: no draft of the benchmark's libraries writes an `any`
of its own.

What is not in the suite: probes written to find the edge of a rule rather than a mistake a user makes (an
inherited `valueOf()`, a draft's iterator kept, a callback kept in a record, `[f][0]()`). They were here once and
are now `compiler/test/confined.mjs`'s, which runs each with its controls.

Nor a mistake against one library's own rules (08 CN-8): a variant is a Solid mistake — reactivity, ownership, or a
contract a declaration states in the generic words — made while using a library. A TanStack query key that misses an
input of its function is the cache's contract, and `@tanstack/eslint-plugin-query`'s `exhaustive-deps` to refuse; it
was a variant of `query-mutation` and is not one now.

Nothing in a task names a rule of the checker: the programs come from the
libraries' documentation and from what goes wrong in Solid apps, and the
expected diagnostics are the ones the language already has for the mistake
(or the one its spec says it should have). A fix to the compiler follows from
a rule in `spec/`, never from a task.

**The `any` census.** `node bench/any-census.mjs` drafts every module the tasks declare and the coverage suite lists,
once each (a process a draft, with a heap limit, a watch on its memory and a wall-time limit; `--out dir`, `--only
text`, `--jobs n`); `node bench/any-origin.mjs --in dir [--tags dir]` then says of each `any` the drafts call the
library's own where it stands in its row (what the checker reads there), where it comes from (the package's own
declaration files, another package's, TypeScript's printer), and whether the package's TypeScript source writes it too
— the source it ships, or (`--tags`) checkouts of its repository at the git tag of the installed version. It also
places the parts said by place. `bench/any-census.txt` is the last run; what it showed is in
`tooling/rx-language-server/DECLARATIONS.md`, *What the `any`s left are*.

## The coverage suite

A task is one job with its mistakes; it samples a library. The coverage suite (`bench/coverage/`, `coverage.mjs`,
`cover.mjs`) is the other measure: *every* package of the libraries `coverage/libraries.json` lists, so that "the
ecosystem" is a list that is held. Today: every `@solid-primitives` package whose latest release accepts `solid-js ^2`
(98; the 12 that do not are listed there with their peer range, and not tested), every module of `solid-use`, and each
family of `@wardic/solid` and `@ui-sdk/solid`, and — since 2026-11-24, for the two forms of 09 MO-11u and MO-11c —
`solid-sonner` and `solid-marked` (the first, with `ui-sdk/overlays`, also for a method's row, MO-8t: `toast.success`,
`toast.dismiss`). For each module two things are held:

- **it is drafted whole** by `rx-declare`, with no `any` of the draft's own (09 MO-8q) — the same count the tasks make
  of the modules they declare, here over every module the library exports;
- **a program uses it** as its documentation does — an *entry*, `coverage/<group>/<name>/`: `main.rx`, the rows it
  keeps of the draft under `rx-types/`, and `use.mjs`, which says what the page must say. An entry is judged as a
  task's good program is (accepted by both checkers, typed by the library's own types with no `any` written, run),
  rendered on the server and hydrated where the package allows it. Where it does not, the entry says why (`server`,
  `hydration`): a package whose module is compiled for the DOM alone, a primitive with no server path, a component
  that renders its children by another path on the server. Where a shape has no row (09 MO-8r) the entry has a module
  of the app's own beside it, and says which shape (`note`). Twenty-seven entries have one (thirty until 2026-11-25:
  a module's default export needs none, 09 MO-8u), each with a reason that is not the notation's to lift with a
  word: a Solid signal the library takes, a class to construct, a component written for the DOM, a tagged template,
  one function that reads and writes, state made in a callback.

`coverage/coverage.txt` is the last run committed — a row a module: its rows, the library's own `any`s, the parts said
by place, the program that imports it, the words written by hand, whether it is rendered on the server and hydrated,
and after the tables what each entry says of its package — and `coverage/coverage.json` the same as data. `--check`
holds it as it holds the scorecard: an entry that was green may not turn red, its declarations may not need more
words nor hold more `any`s, no draft may write an `any` of its own (or say more by place than recorded), and the list
itself is held — every module `libraries.json` names is drafted, every one it says a program must import is imported
by an entry, each package is at its recorded version in `bench/package.json` and still accepts Solid 2. Entries run
several at once (`BENCH_JOBS`, half the cores by default), beside the tasks; a module no entry's program imports is drafted
whole too. What took less than a second and a half the time before (`.out/ws/.took.json`) runs several to a process, one
after the other: what it cost was mostly the process's start.
`--shard i/n` runs every n-th entry and drafts every n-th such module, and holds the whole list (what an entry drafts
and imports is read off its `use.mjs`); `.github/workflows/bench.yml`
runs the tasks and the suite over two jobs each. The tasks run several at once too, those that build with Vite at most two
at a time; what is reported does not depend on the number, nor does its order.

To add a package: its name and version in `bench/package.json` (and the lock), its modules in `libraries.json`, and an
entry. `use(import.meta, { pkg, title, ssr: /what the server's render says/, dom: /what the page says/ | async (h,
page) => { … } })` is all an entry's `use.mjs` is.

## The tasks

| task | the job | the mistakes |
| --- | --- | --- |
| `formisch-field-path` | a Formisch form whose fields are named by typed paths into a valibot schema | a schema that reads state, a form made in the view; *(unrepresentable)* a write while the view computes, state assigned with `=` |
| `formisch-field-array` | a Formisch array field: rows inserted, removed and moved by the library's methods | a method called while the view computes or given to a button called, the form made in the view |
| `query-forward` | a TanStack Query result passed down: its data to a list, a flag to a badge, the data and the status to a panel; a refetch; a failing query. The query's hook is a module of the app's own over the library's, its `data` an accessor that waits and fails (09 MO-10l, MO-8r, MO-12e) | the data read with no `errored` region, or no `loading` one in a client-only build, the result stored in a record or given whole to a child, the query made in the view, its hook beside the provider, a refetch while the view computes or called where the handler is given, the data written |
| `query-mutation` | a TanStack Query mutation that invalidates its query; the cache sent from the server and taken up in the browser (dehydrate / hydrate) | the query read with no `errored` region, the mutation run or the cache invalidated while the view computes, the mutation made in a handler, a hook outside the provider, a callback that writes where the library may call it in a computation |
| `router-provider` | a TanStack Router app on the router's file-based routing (its Vite plugin writes `routeTree.gen.ts`), its layout and pages `.rx` components the TSX route files render, where `host.d.rx` says (09 MO-14); the app's entry is `.rx`: it provides a context a page reads and frames the router's component in the app's own `Shell`, and the layout renders its pages with the router's `<Outlet />` (MO-14f) | a page that fails with no region around its layout's outlet, or waits with no `loading` one in a client-only build, the outlet beside the regions, a layout with no outlet, a declaration that does not import the outlet, the app's provision removed, a hook or a link outside the router, a page applied by hand beside it, the router's component used as a value; *(unrepresentable)* a route given a rendered element |
| `router-data` | `@solidjs/router` 2.0's data layer: a `query()` a page reads, a form action, `useSubmissions`, `revalidate`, and the cache emptied by `query.clear()`, a method of the library's `query` with a row of its own (09 MO-8t) (2.0 has no `createAsync` nor `useSubmission`: a query is read by an equation that awaits it) | an async read with no boundary, `revalidate` or `query.clear()` called while the view computes, a cache entry deleted by an equation, a method given called to a button, a submission's input or a query's answer kept in state |
| `router-rx-routes` | TanStack Router with **`.rx` route files**: each file of `src/routes` is its route's component, and the generator writes the route objects into `routeTree.gen.ts` (its `routeComponentExtensions`, a fork's option: the two packages are installed from `vendor/`'s tarballs, whose README says which commit and why tarballs). A route's options are in the same file: `export route = { loader, validateSearch }`, which the generator spreads into the route (`routeComponentOptionsExport`, the fork's second option; 11 CP-4d) — the loader's answer and the validated search typed in the page, and in every link, through the generated tree. The root layout renders the router's outlet through a component of the app's own in another module (`src/frame.rx`, 09 MO-14f). The router in the app's component; `host.d.rx` derived from the tree (MO-14g); the dev server driven through an edit of a route file, a reload, and a route file added (11 CP-4b) | a page that fails with no region around the root route's frame, or waits with no region around the frame's outlet in a client-only build, the frame beside the layout's region, the outlet beside the frame's, a frame with no outlet, a component that renders its own children given none, the app's provision removed, a hook, a link or the loader's data outside the provider, a route file applied by hand, a page's failure of a class the layout's region does not take, a loader that does io, a loader that writes, a route file added and the declaration not written again (refused by the build), the declaration edited by hand (refused by `rx-tsc`) |
| `start-route` | a TanStack Start app whose file routes render an `.rx` layout and `.rx` pages, served and hydrated at `/people/2?tab=role`; `host.d.rx` says what the router does with them (09 MO-14) | a page that fails with no `errored` region in its layout, the layout's pages beside its regions, a router hook in a component the declaration does not place, a declaration that puts a page beside its layout or provides no router, a param copied into state; *(unrepresentable)* state written while a page renders |
| `file-routes` | file-system routes over `.rx` route files (`filesystem-routing`, SolidStart's conventions as a package, with `@solidjs/router`): a layout `(app).rx` whose region holds the pages of `(app)/`, each route file's default component its page, and an `.rx` entry that provides a context a page reads and holds the router's component in a `loading` region; `host.d.rx` says what the manifest's router does with them, and that it renders through the router's component (MO-14f). Run beside it: a copy whose router is a module with a `toPath` of its own, the declaration derived from that module (MO-14g), and its routes directory refused as a source | the same mistakes, and: a client-only build with no `loading` region around the router, that region beside the router, the app's provision removed, a hook in the app's component above the router, a layout that forgets its pages, a declaration that does not import the router's component, a router's component not declared to provide the router |
| `start-mode` | **Solid's own start mode** (`solid({ start, ssr: true })` in `@solidjs/vite-plugin` 3: the plugin owns the entries, the dev server's render and the build; SolidStart is not needed) with `filesystem-routing` and `@solidjs/router`: an `.rx` root named in the config (`start.app`, and the front end's `pages`: no TS file between), `.rx` route files, an app that lists the compiler and no runtime (11 CP-4a), each request rendered on the server, streamed and hydrated — by the Node server start mode emits, and by its dev server, where an edited route file is shown and rendered again. `host.d.rx` derived from the routes directory. It is `file-routes`' program, served | a page that fails with no region in its layout, the pages beside the region, a layout that forgets them, the root's provision removed, a hook above the router or in a component the declaration does not place, a param copied into state, a declaration that puts a page beside its layout, a router component not declared to provide the router, a route file added and the declaration not written again (refused by `rx-tsc`, and by the build); *(unrepresentable)* state written while the root renders |
| `store-updater` | a Solid store updater written once and used by two handlers; a snapshot read out of the draft | the store written outside its setter, the updater called by hand, an `await` in the updater, a closure that writes the draft later |
| `store-helper` | a Solid store's draft changed in place by a helper written in JS (`moveItem(d.columns, from, to)`) | the helper given the store itself, called while the view computes, the draft kept by a closure |
| `table-pagination` | a TanStack Table: cell components rendered by the adapter's `<FlexRender>` (as `@tanstack/solid-table` 9 has it; the table's row says `renders(FlexRender)`, 09 MO-11u), a cell that reads the app's context, pagination buttons, a pager given page numbers and handlers, and — shadcn/ui's `DataTablePagination` — a component given the table itself | a cell's context provided nowhere above the table, a page turned while the view computes, the table made from data read once |
| `kobalte-toast` | Kobalte 2 (`@kobalte/core`, its `solid2` branch at `ref/KOBALTE`) toasts: a toast component shown from a handler and rendered by the library's list, reading the app's context and the library's region; a toast that asks before it says; the list cleared. The toaster is the library's own object, called as its documentation calls it: `toaster.show` is a method with a row of its own (09 MO-8t), `renders(Toast.List)` (MO-11u). No module of the app's own is between (there was one until 2026-11-25), and the declaration is the draft's rows, no word by hand; `rx-verify` holds the method's row against Kobalte in the task's run | a toast written in the view outside any region, the list outside its region, a close button beside its toast, the app's context beside the list, a toast that can fail with no `errored` region above the list, the row without the word, a toast shown or the list cleared while the view computes, a toast dismissed by an equation, a method called where the handler is given, the toaster's name bound again, the toast's component called where it is handed over |
| `router-code-routes` | TanStack Router's code-based routes written in `.rx` with the library's own `createRoute` (its row says `renders(RouterProvider)`, 09 MO-11u): pages rendered beneath the provider in the app's `Shell`, a module away, under a context the app provides, the root layout's `errored` and `loading` regions around its `<Outlet />` holding them — `host.d.rx` is read off the router the module exports (`//@ routes ./main.rx`: `rx-declare` compiles the module, runs it and asks the router object for its tree, MO-14g), and a page the view places is checked where it places it (MO-14h). Every declaration is the draft's, no word by hand; the route tree registers the router, so links and hooks are typed by the routes; `rx-verify` holds the host's declaration | a page that can fail with no `errored` region around the layout's outlet nor above the provider, a client-only build with no `loading` region around the outlet, the outlet beside the regions, a layout with no outlet, the host's declaration emptied (the fn's row alone: pages side by side, the layout's regions holding none), the app's context provided nowhere above the provider, a hook outside the provider, a page applied by hand beside the router, the row without the word, a route added and the declaration not written again, the declaration edited by hand (both refused by `rx-tsc`); *(unrepresentable)* a rendered element where a component is given |
| `ui-sdk-dialog` | UI SDK for Solid (`@ui-sdk/solid`): a controlled dialog whose parts are flat exports, a change the app's callback cancels through the library's details, a toggle whose child is a function of its state | a part outside its root, the open state written while the view computes or from the function of state, a handler called where it is passed, a stale read of an own write, the controlled state copied by an effect; *(unrepresentable)* a part the library has not |
| `ui-sdk-forms` | UI SDK's form controls: a checkbox and a radio group whose values the app holds, a button its state enables | a radio beside its group, the change handler called where it is passed, a stale read of an own write, the controlled value copied by an effect; *(unrepresentable)* a function the program has not, a part the library has not |
| `wardic-values` | Wardic's values: a number derived from a prop, a size that cycles, an element that animates to them, under the provider | the meter beside the provider, a value made in a handler, the cycle turned while the view computes, a transform that writes, the derived value written or kept in a source by an effect |
| `wardic-motion` | Wardic (`@wardic/solid`, Motion's API on Solid 2): a motion element whose target follows app state, a tap heard from the element's ward, an exit animation under `<AnimatePresence>` | a motion element beside its provider, a ward made in the view or in a handler, the hearing started while the component computes, the ward's end let out of the action, taps counted by an effect; *(unrepresentable)* a prop read once into a local |
| `solid-use-state` | solid-use's atom and its own injection, each behind a module of the app's own: a reader and a setter, a scope and a hook whose context the declaration names | the hook's reader beside its scope, the atom's setter called while the view computes, its value written, an atom made in a handler or seeded from state, the count copied by an effect |
| `solid-use-primitives` | solid-use's primitives: media query, colour scheme, network and page visibility as values — the last two their modules' default exports, imported as JavaScript imports one (`import { default as useOnlineStatus }`, a row named `default`, 09 MO-8u; a module of the app's own named them until 2026-11-25); a client-only part whose fallback is an element (a component given by name, 09 MO-11t); a value the server makes and the browser takes (served and hydrated) | a primitive made in the view or in a handler, its query computed from state, its value written, a layout kept in a source by an effect, the server's value asked for in the view, the fallback's component called; *(unrepresentable)* the accessor called, as in Solid |
| `primitives-sensors` | solid-primitives' browser sensors (`media`, `connectivity`, `keyboard`, `mouse`): accessors and a store read as values, a shortcut whose callback writes; served and hydrated | a primitive made in the view or in a handler, a query computed from state, a sensor's value written, a layout kept in a source by an effect, the callback called where it is given; *(unrepresentable)* the accessor called, as in Solid |
| `primitives-listeners` | solid-primitives' listeners and schedulers (`focus`, `event-bus`, `scheduled`, `raf`): a listener kept by its effect, a bus, a debounced save, an animation-frame loop | a disposer dropped or kept and never called, a debounced function made in a handler, a source read after its own write, a function a primitive handed back called while the view computes or given called to a handler |
| `primitives-state` | solid-primitives' state helpers (`storage`, `static-store`, `memo`, `sortable`, `pagination`): a persisted signal, a store's fields, a sorted and paged list, a writable memo; served and hydrated | a setter called in the view or given called to a handler, a source's list sorted in place, a memo's function that writes, a value copied by an effect, a primitive's value written, a page read once under `peek` |
| `primitives-virtual` | solid-primitives' listeners and resize observer and a TanStack Virtual list, on an element ref | a listener's disposer dropped (its type an alias), a primitive made in a handler; *(unrepresentable)* the ref read before there is an element |
| `frozen-read` | formatters kept in a record, read by the view, by a primitive and by a seed | a formatter read under a kept `peek`, given to a value parameter, used as a seed |
| `source-mutation` | a list in a source, added to by a write and sorted for display | `rows.push(…)`, a prop sorted in place, a row written through a local alias, the value a functional write is given reversed in place |
| `keyed-edits` | a keyed list edited every way: insert, remove, move, rename in place, reset | rows written out with one key in a handler, rows keyed by their index, a row written through the loop's name |
| `listener-cleanup` | a JS listener whose disposer the mount effect returns | the disposer dropped: in the effect, in a handler, in a local never used |
| `duplicate-keys` | a keyed list whose rows keep their state across a reorder | two literal rows with one key; a row added at run time with a key the list has (named on the console by the runtime, in a development build) |
| `effect-derived` | a total that is an equation, a history the clicks write, an effect for what leaves the program | the total kept in a source by an effect (with and without inputs), a history appended by an effect, a mount effect that reads what it never hears of again |
| `projection-selection` | a selection as a projection (`draft(…)`, Solid's `createProjection`): picking a row tells two rows | the selection kept in a store by an effect, the projection written from a handler |
| `optimistic-todo` | an optimistic add: a guess, the server asked, the list asked again, a refusal taken back | a guess where nothing is awaited, an `await` before the guess, the answer written to, a failure let out |
| `context-provider` | a context of the app's own, a provider component holding the state, readers under it | a reader beside or above the provider, the provided state written or changed in place, the provided action called while the view computes |
| `sequential-awaits` | an action whose second load needs the first's answer, the independent one asked beside them (asserted: two calls in flight at once) | two independent loads awaited one after the other (advice) |
| `rx-package` | a library written in `.rx`, built by `rx-lib` and installed as a package (its `dist/` only): used by an `.rx` app, checked against the shipped `.d.rx`, and by a `.tsx` Solid 2 app type-checked by plain `tsc` against the shipped `.d.ts`; both served, hydrated and driven in Chromium. The run also holds that each verdict against the shipped `.d.rx` is the verdict against the package's source, and that no word of that `.d.rx` is written by hand (it is the text both checkers print); that the `.tsx` app's server render is a plain `renderToStream` (and the same inside a request event), that two renders at once each have their own instance of the package's state, and that an `.rx` program and JavaScript in one page share one (09 MO-13g) | the package's component outside its provider, its context provided beside the reader, its rate read where one failure gets out, its failing component under no boundary, its source written, a plain source asked again, its action called while the view computes, its primitive called in a handler, its rows restated at the import |
| `ssr-divergence` | a value only the browser knows, asked as a client question | the question read with nothing to hold it, client JS called for its value, what only the browser knows declared `pure` and read by the view (refused by `rx-verify`, which runs the fn with a window and without one) |

Two libraries have no Solid 2 build yet, and each has a small adapter in its task, as `@tanstack/solid-table` and
`@tanstack/solid-virtual` are for Solid 1: `table-pagination/src/table.js` over `@tanstack/table-core`, and
`primitives-virtual/src/virtual.js` over `@tanstack/virtual-core`.
## The scorecard

`scorecard.txt` is the last run committed, for a reader, and `scorecard.json` the same as data, one line a task: what
`--check` compares with. Every check that is not green is listed with the reason its task's `known` gives. `audit.txt`
lists the words of the declarations that the code neither shows nor refutes: what a reviewer has left to check. Earlier
runs and how the suite came to be as it is: [archive/HISTORY.md](archive/HISTORY.md).

## What the numbers mean

- **A check is one fact.** A good entry is one check: both checkers accept it and say the same (it was three until
  2026-11-26: the crate, `ref/`, and that they agree, which follows). Eight of the 123 coverage entries have a one-line
  mistake of their own; the other 115 show that a library can be used, and nothing about what is refused.
- **An `any` counts where it stands** (09 MO-8q): at each parameter, part of the result, prop, function type's parameter
  and type argument, against the library's own type there. Until 2026-11-26 it was credited by export, so that one moved
  from a parameter to a result was "inherited". `bench/measure.test.mjs` holds the counting.
- **A claim is one behaviour word of one row** (its `ref`s and what it `fails` with are one claim each), in one of three
  classes, never merged: *proven by the generator* (the reading `rx-declare` writes a word from proves it), *held by a
  probe* (a run that fails over a module changed so that the claim is false: rx-verify runs each again that way), and *the
  author's own* (nothing has shown it). The last are hand-written, in the app's own declarations, and stay only where a
  correct program is refused without them: `bench/needed.txt` lists each with the diagnostic (`bench/needed.mjs`). Until
  2026-11-24 a claim was one of rx-verify's obligations: an unmarked callback counted, the `pure` of a primitive did not,
  and what a probe showed was not tested.
- **Probes are one file a package** (`bench/probes/<spec>.probe.mjs`), put beside each declaration of it.
- **What could not be measured is a failure of `--check`**: an audit or a verifier that did not answer was counted as one
  with nothing to say.
- **Words read from the code** are counted whoever the tool reads them for, and 932 of the 984 `handler` words of the
  coverage suite's drafts are three packages' maps of DOM events, one word an event.
