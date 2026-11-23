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
has an install of its own, from the lock beside it, for a library that pins
another version: TanStack Start pins its router; a `vendor/` folder beside it
holds packages the lock names by file — a library's fork, packed, each with
its integrity in the lock). The lockfiles are what make
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
| **hand-written `.d.rx` words** | for every `.d.rx` of the task, the words a person wrote on top of what `rx-declare` drafts for the same module (run by the suite, with the flags the task's `declare` names: `--run --dom` where the draft was made by running the package). A row the draft has word for word costs nothing, a row it has otherwise costs the words that differ, a row it has not costs every word; rows left out cost nothing. It is what an app pays to use the library |
| **`any` inherited** | the `any`s those files hold that the library's own declaration has at that place (09 MO-8q): for an export, as many as `rx-declare`'s draft of the same export writes for the library's own (`rx-declare --causes`, cause `vendor-any`). They are reproduced, not narrowed |
| **`any` introduced** | every other `any` those files hold: written where the library has a type. It must be none. One that cannot be named yet is listed in `any-allowlist.json` — the task, the file, the export, how many, a one-line reason and what blocks naming it — and nowhere else |
| **by-place** | the parts those files say by their place in the library's declaration (`Parameters<typeof import(…)>`, `ReturnType<…>`): a type in name only, counted apart so that it is not a way around the rule above |

`BENCH_WORDS=1 node bench/run.mjs <task>` prints each row written by hand beside the draft's row of the same export:
what a person added, which is where a draft or `known.js` can still do more (it found, on 2026-11-25, a context word
that was false of the library: UI SDK's `DialogTrigger` renders outside a `Dialog`).

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
several at once (`BENCH_JOBS`, 8 by default); a module no entry's program imports is drafted in a process of its own.
`--shard i/n` runs every n-th entry and drafts every n-th such module, and holds the whole list (what an entry drafts
and imports is read off its `use.mjs`): in one CI job with the tasks the run took 31 minutes, 7 of them the tasks', so
`.github/workflows/bench.yml` runs the tasks and three shards as four jobs.

To add a package: its name and version in `bench/package.json` (and the lock), its modules in `libraries.json`, and an
entry. `use(import.meta, { pkg, title, ssr: /what the server's render says/, dom: /what the page says/ | async (h,
page) => { … } })` is all an entry's `use.mjs` is.

## The tasks

| task | the job | the mistakes |
| --- | --- | --- |
| `formisch-field-path` | a Formisch form whose fields are named by typed paths into a valibot schema | a schema that reads state, a form made in the view; *(unrepresentable)* a write while the view computes, state assigned with `=` |
| `formisch-field-array` | a Formisch array field: rows inserted, removed and moved by the library's methods | a method called while the view computes or given to a button called, the form made in the view, the row ids changed in place |
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
| `kobalte-toast` | Kobalte 2 (`@kobalte/core` 2.0.0-alpha.5) toasts: a toast component shown from a handler and rendered by the library's list, reading the app's context and the library's region; a toast that asks before it says; the list cleared. The toaster is the library's own object, called as its documentation calls it: `toaster.show` is a method with a row of its own (09 MO-8t), `renders(Toast.List)` (MO-11u). No module of the app's own is between (there was one until 2026-11-25), and the declaration is the draft's rows, no word by hand; `rx-verify` holds the method's row against Kobalte in the task's run | a toast written in the view outside any region, the list outside its region, a close button beside its toast, the app's context beside the list, a toast that can fail with no `errored` region above the list, the row without the word, a toast shown or the list cleared while the view computes, a toast dismissed by an equation, a method called where the handler is given, the toaster's name bound again, the toast's component called where it is handed over |
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

## What the suite decided

`scorecard.txt` lists every check that is not green, each with the reason its task's `known` gives: the rule of
`spec/` that makes it one. `spec/rfc-revisions-2026-11-22.md` lists what each task changed in the language.

## The scorecard

`scorecard.txt` is the last run committed, and `scorecard.json` the same as data (what `--check` compares with).
Three earlier runs are kept beside it:

- `baseline-d6e640e.txt`: the run at the commit this suite was first written against, before any of the work it drove;
- `scorecard-2f9baf7.txt`: thirteen tasks, as the suite stood when it was reviewed (four columns; its bad variants
  held probes and unwritable programs);
- `baseline-rebased.txt`: the suite as it is now — the probes moved out, the unwritable variants counted apart, the
  declarations measured, eleven tasks added — run on the checker of `2f9baf7`, before any change to it.

No check is red in `scorecard.txt` since 2026-11-24. Two were until then, each with its reason in its task's `known`:
a duplicate key computed at run time (`duplicate-keys`: reported by the runtime in a development build now, 06 ST-4d)
and a `pure` JS call that answers differently on the server (`ssr-divergence`: refused by `rx-verify` now, which runs
the word on both sides, 10 SV-7c — hydration itself still says nothing, and the variant is counted as caught by
running the declaration, not by a build).

Kobalte's two tasks (`kobalte-dialog`, `kobalte-select`) left the suite on 2026-11-22, and three libraries came in
(`ui-sdk-dialog`, `wardic-motion`, `solid-use-primitives`), each declared by `rx-declare`'s draft with the hand-written
words counted; `spec/rfc-declaration-types-2026-11-22.md` (*A fourth round*) lists what their declarations could not
say. The one run check that was red with a reason, Kobalte's own read of a store row in an effect's callback, went
with `kobalte-select`. `baseline-rebased.txt` and the two older scorecards are records of their runs and still list the
Kobalte tasks. (Kobalte is back since 2026-11-24, with `kobalte-toast`: its toaster is one of the three libraries
`renders(H)` was taken on, and the bar counts a pre-release as it counts a stable one.)

The totals moved with the tasks, not with any check. Before (25 tasks): good 75/75, types 115/115, runtime 154/155,
bad 113/115, unrepresentable 8/8, 135 hand-written words, 23 `any` inherited, 0 introduced, 4 by place. The two Kobalte
tasks were 6, 9, 11/12, 6 and 3 of those, with 12 words, 1 inherited `any` and 2 parts by place; the three new tasks
are 9, 18, 29, 18 and 3, with 43 words, 10 inherited and 9 by place. Now (26 tasks): good 78/78, types 124/124, runtime
172/172, bad 125/127, unrepresentable 8/8, 166 words, 32 inherited, 0 introduced, 11 by place. `scorecard.json` is that
run, and what `--check` now holds each task to.

On 2026-11-23 six tasks came in with the coverage suite (`primitives-sensors`, `primitives-listeners`,
`primitives-state`, `solid-use-state`, `ui-sdk-forms`, `wardic-values`): 18 good, 31 types, 35 runtime, 36 bad and 3
unrepresentable checks, all green, with 57 hand-written words, 9 inherited `any`s and 16 parts by place. The 26 tasks
before them are as they were (good 78/78, types 124/124, runtime 172/172, bad 125/127, unrepresentable 8/8, 158 words,
32 inherited, 0 introduced, 11 by place), through a change to what a compiled program does at run time (09 MO-10a: a
primitive's own owner). Now (32 tasks): good 96/96, types 155/155, runtime 207/207, bad 161/163, unrepresentable
11/11, 215 words, 41 inherited, 0 introduced, 27 by place. The coverage suite beside them: 120 programs, 120 green;
190 modules drafted whole (4877 rows), 1195 `any`s the libraries' own, none introduced, 1519 by place; 253
hand-written words.

On 2026-11-23 the vocabulary's three forms kept on one library's evidence were settled (09 MO-8r, *Settled*), and
the suite follows the decision. **Given up, each a variant that a withdrawn form refused, and none caught another
way:**

| task | the variant | was | why it is given up |
| --- | --- | --- | --- |
| `query-forward` | `data` read with no `errored` region above it | `UNHANDLED_FAILURE` | `pending` and `fails(…)` before a declared result's field (MO-10f) were one library's. The query's `data` is an accessor now, through a module of the app's own, and an accessor asks for no region (MO-10d): what every other library's waiting value already got |
| `query-forward` | a client-only build with no `loading` above the data | `ASYNC_OUTSIDE_LOADING_BOUNDARY` | the same |
| `query-forward` | the result stored in a record | `RESULT_AS_VALUE` | a result with accessor parts is a value: there is no field-at-a-time reading left to protect |
| `query-forward` | the whole result given to a child that takes it for plain data | `RESULT_AS_VALUE` | the same (the program passes the data and the status, each a value) |
| `query-mutation` | the query read with no `errored` region | `UNHANDLED_FAILURE` | as the first |
| `table-pagination` | a row of the table handed up through a prop's callback | `RENDERS_ESCAPES` | `renders` alone (MO-11l) was one library's. With no word a cell is checked under a root of its own and the table is a plain value: handing a row up is no mistake |
| `table-pagination` | the table kept in app state | `RENDERS_ESCAPES` | the same |
| `table-pagination` | a cell component's context provided nowhere above the table | `CONTEXT_NOT_FOUND` | a cell reads no context of the app now (the good program's `NameCell` no longer does: its tone is on the table), so there is no variant to make |

Eight variants, in three tasks. Four came in that the new shapes make: the query's hook beside the provider
(`CONTEXT_NOT_FOUND`, through the wrapper's `export context … from`, MO-12e), a refetch while the view computes and
one called where the handler is given (`IO_IN_REACTIVE`), the query's data written (`WRITE_TO_NON_SOURCE`); and one
for the element in a prop, the fallback's component called as a function (`COMPONENT_AS_VALUE`, `solid-use-primitives`).
`router-provider` keeps its three variants: `renders(later)` and the words beside it are one library's too, and their
removal is a change of its own (MO-8r).

The totals, before (at `b9fe0d4`) and now, both from a fresh `npm ci`. Tasks (32): good 96/96 and 96/96, types
155/155 and 155/155, runtime 207/207 and 207/207, bad 161/163 and 158/160 (the same two red, with their reasons; eight
variants given up, five in), unrepresentable 11/11 and 11/11, hand-written words 215 and 249 (the two query tasks'
wrapper is a module of the app's own, so its row is by hand: 17 words each, where the library's row had been
`known.js`'s), `any` inherited 41 and 41, introduced 0 and 0, by place 27 and 27. Coverage: 120 programs and 121
(`ui-sdk/overlays`), all green; 190 modules drafted whole (4877 rows), 1195 `any`s the libraries' own, none introduced,
1519 by place, as before; hand-written words 253 and 268 (`primitives/range` declares `<Range>` by hand for its
fallback, +8; `wardic/gestures` names Wardic's context, +7); four programs run one or two checks more (each shows its
fallback's element).

On 2026-11-23, later the same day, the bar was applied to the end (09 MO-8r *Settled*, MO-10l): `renders(later)`, a
prop's `renders`, `nests(component under parent)` and `outlet` are withdrawn, and an accessor that waits or fails
says so before its `ref`. `router-provider` is rewritten onto a factory of the app's own, `query-forward` and
`query-mutation` declare their hook's `data` `pending fails(Error) ref`, and four entries of the coverage suite do the
same of the accessor they read. **Given up with the four words, and not caught another way:**

| task | the check | was | why it is given up |
| --- | --- | --- | --- |
| `router-provider` | type probe: a link to no route (`<Link to="/home">`) | `TS2322` / `TS2820`, from TanStack's registered router | the route tree is made inside the app's factory (`routes.js`), which hands back a component: there is no router value in `.rx` whose type `Register` could name. `renders(later)` and the words beside it (MO-11o, MO-11p), which let the tree be written in `.rx` with the library's own functions, were one library's |
| `router-provider` | type probe: `useParams({ from })` names a route of the tree | `TS2322` / `TS2345`, the same way | the same |
| `router-provider` | type probe: the `Shell`'s `router` prop is the library's router type | `TS2322` | the frame takes the made router as its children now, not a router value as a prop: there is no such prop to type |
| `router-provider` | bad variant: the router built, and never rendered | `COMPONENT_AS_VALUE` | it was reported through the carried components (a component a value carries that no `renders` prop reaches). A made component that is never applied renders nothing, and nothing is unchecked |

Three type probes and one bad variant, in one task. In their place: a route record with no component (`TS2741`,
through the factory's own types), a link's `to` given a number, and the page's backend type (three probes); a link
beside the router in the app's frame (`CONTEXT_NOT_FOUND`) and the made router used as a value
(`COMPONENT_AS_VALUE`) (two variants). The other four variants are the old ones, written for the new shape, and
are refused as they were.

**Back, of the eight given up earlier that day:** the five that a query's `data` read with no region made
(`query-forward`: no `errored` region, no `loading` one in a client-only build, the result stored in a record, the
whole result given to a child; `query-mutation`: no `errored` region). They are refused through the hook's own row,
`data: pending fails(Error) ref T` (MO-10l), which costs three hand-written words in each task. The three of
`table-pagination` stay given up: `renders` alone was one library's, and a table cell that reads the app's context
was decided to get no form.

On 2026-11-23, later again, a host declaration was taken (09 MO-14): what a file-based router does with the `.rx`
components it renders, said once in `host.d.rx`. `router-provider` moves from the factory to TanStack Router's file
routes (the generated route tree in TypeScript, TSX route files that hand `.rx` components to their routes),
`start-route` gets an `.rx` layout whose regions hold its pages, and `file-routes` is new (`filesystem-routing` with
`@solidjs/router`, the route files themselves `.rx`). **Back, of the four given up with the route-tree words:**

| task | the check | how it is back |
| --- | --- | --- |
| `router-provider` | type probe: a link to no route (`<Link to="/home">`) | the route tree is the generator's, in TypeScript, and registers the router: `TS2322` in `pages.rx` |
| `router-provider` | type probe: `useParams({ from })` names a route of the tree | the same |

**Still given up:** the type of a router passed as a prop (the router is a TSX module's now, and its component is
what `.rx` applies: there is no such prop), and the router built and never rendered (the same reason as before).
**Out with the factory:** `router-provider`'s probes that a route record has its component and that a link's `to` is
not a number (the first is the route file's TypeScript now, the second is subsumed by the link to no route), and its
variant of a rendered element in a route record as a `PARSE` (it is a `ts` variant now: TypeScript refuses it in the
route file). **In:** nine variants and five probes over the three tasks — a declaration that puts a page beside its
layout, a declaration that provides no router, a hook in a component the view does not name, a layout that renders
its pages beside its regions (`start-route`, `file-routes`); a link to no route and a route's missing param through
the manifest's types (`file-routes`); and, as a run-time check of two tasks, `rx-verify` holding each `host.d.rx` to
the scene its probe gives. The totals, before (at `8212c58`)
and now, both from a fresh `npm ci`. Tasks (32, then 33): good 96/96 and 102/102, types 155/155 and 161/161, runtime
207/207 and 214/214, bad 164/166 and 175/177 (the same two red, with their reasons), unrepresentable 11/11 and 11/11,
hand-written words 269 and 277 (`router-provider` 21 to 8: the factory's row is gone, and its `host.d.rx` is the
draft's but for the nesting, one word; `start-route` 20 to 28, its `host.d.rx`; `file-routes` 13), `any` inherited 41
and 41, introduced 0 and 0, by place 27 and 28 (`start-route` declares `<Link>`, whose `params` is said by place).
Coverage: unchanged — 121 programs, all green; 190 modules drafted whole (4877 rows), 1195 `any`s the libraries'
own, none introduced, 1519 by place; 277 hand-written words; bad caught 8/8. A host declaration is measured against
`rx-declare --host`'s draft of the modules it imports, as every `.d.rx` is against the draft of its module.

On 2026-11-23, last, a host declaration came to say what the host renders through (09 MO-14f), and two tasks are the
programs it was decided on. `router-provider`'s root layout renders the router's `<Outlet />` itself (its route file
gives the route the layout, and no longer wraps it), and its `.rx` entry provides a context a page reads;
`file-routes` has an `.rx` entry (it was TSX) that provides a context a page reads and holds the router's component in
the `loading` region. With the checker before, the first was refused (`CONTEXT_NOT_FOUND`) and its layout's pages were
not checked at all, and the second was refused twice. **In:** eleven variants over the two tasks — the app's provision
removed (both), a layout with no outlet, the outlet beside the layout's regions, a declaration that does not import the
outlet (`router-provider`); the app's region beside the router, a hook in the app's component above the router, a
layout that forgets its pages, a declaration that does not import the router's component, a router's component not
declared to provide the router (`file-routes`, where "the host's declaration provides no router" was: the provision is
the applied component's row now) — and `rx-verify` holds each declaration's new claim (`through:…`) in the task's run.
**Out:** none. `start-route` is as it was: its layout takes the outlet as `props.children` from its route file.
The totals, before (at `e30ca84`) and now, both from a fresh `npm ci`. Tasks (33): good 102/102 and 105/105, types
161/161 and 161/161, runtime 214/214 and 214/214, bad 175/177 and 184/186 (the same two red, with their reasons),
unrepresentable 11/11 and 11/11, hand-written words 277 and 308 (`router-provider` 8 to 26, `file-routes` 13 to 26:
each `host.d.rx`'s imports from JavaScript and its entry's record, and the router's component's row with
`provides(router)`), `any` inherited 41 and 41, introduced 0 and 0, by place 28 and 28. Coverage: unchanged — 121
programs, all green; 190 modules drafted whole (4877 rows), 1195 `any`s the libraries' own, none introduced, 1519 by
place; 277 hand-written words; bad caught 8/8. A host declaration is measured against `rx-declare --host`'s draft of
the `.rx` modules it imports; what it imports from JavaScript is by hand.

On 2026-11-24 `renders(H)` was taken (09 MO-11u: a component a fn is given is rendered later beneath a component of
the same declaration), on three libraries of Solid 2 run for it, and a `Component` inside a record or an array in a
JS component's prop is read as a direct one is (MO-11c). The bar counts the ecosystem's releases, pre-releases
included (MO-8r), and Kobalte is back.

**Back, of the three `table-pagination` variants given up on 2026-11-23:**

| task | the variant | how it is back |
| --- | --- | --- |
| `table-pagination` | a cell component's context provided nowhere above the table (`CONTEXT_NOT_FOUND`) | the adapter exports a `<FlexRender>` component, as `@tanstack/solid-table` 9 has, and `createTable`'s row says `renders(FlexRender)`: a cell is checked among its children, wherever the view applies it, so `NameCell` reads the app's context again |

**Still given up:**

| task | the variant | was | why |
| --- | --- | --- | --- |
| `table-pagination` | a row of the table handed up through a prop's callback | `RENDERS_ESCAPES` | `renders(H)` names a place and confines no value: the table is a plain value, and handing a row up is no mistake |
| `table-pagination` | the table kept in app state | `RENDERS_ESCAPES` | the same |
| `router-provider` | the type of a router passed as a prop; the router built and never rendered | `TS2322`; `COMPONENT_AS_VALUE` | as before (the first is back in `router-code-routes`, where the router is a value of the program's: "the Shell's router prop is the library's router type") |

**In:** two tasks and two coverage entries. `kobalte-toast` (8 variants: a toast outside any region, the list outside
its region, a close button beside its toast, the app's context beside the list, a toast that can fail with no
`errored` region above the list, the row without the word, a toast shown while the view computes, the component
called where it is handed over; and `rx-verify` holding every hand-written word against Kobalte).
`router-code-routes` (6 variants and one that cannot be written, 4 type probes — the two registered-route probes among
them, from a tree written in `.rx`). `solid-sonner/toaster` (3: the context beside the toaster, no toaster, the row
without the word; `rx-verify` holds the row) and `solid-marked/markdown` (2: the context beside `<Markdown>`, the
record of components built outside the prop). **Out:** none.

The totals, before (at `cb68950`) and now, both from a fresh `npm ci`. Tasks (33, then 35): good 105/105 and 111/111,
types 161/161 and 172/172, runtime 214/214 and 228/228, bad 184/186 and 199/201 (the same two red, with their reasons),
unrepresentable 11/11 and 12/12, hand-written words 308 and 340 (`table-pagination` 43 to 44; `kobalte-toast` 24;
`router-code-routes` 7, none of them in the router's declaration), `any` inherited 41 and 60 (the router's own, in the
rows `router-code-routes` keeps whole), introduced 0 and 0, by place 28 and 41 (the same rows; `table-pagination` 1 to
0). Coverage: 121 programs and 123, all green; 190 modules drafted whole and 193 (4877 rows and 4904), 1195 `any`s the
libraries' own, none introduced, 1519 by place, as before; 277 hand-written words, as before (the two new entries
write none); bad caught 8/8 and 13/13. No other entry's record moved.

**New, in the coverage suite:** an entry may hold bad variants of its own (`bad` in its `use.mjs`, judged as a
task's are; the record has a `bad caught` column). Four do, two each — the accessor read with no `errored` region,
and with no `loading` one in a client-only build: `solid-use/fetch`, `primitives/sse`, `primitives/graphql`,
`primitives/geolocation`. `primitives/mediastream` has none: `createStream` neither waits nor throws in its 1.0.0.

The totals, before (at `36eac32`) and now, both from a fresh `npm ci`. Tasks (32): good 96/96 and 96/96, types
155/155 and 155/155 (three probes out, three in), runtime 207/207 and 207/207, bad 158/160 and 164/166 (the same two
red, with their reasons; one variant given up, five back, two new), unrepresentable 11/11 and 11/11, hand-written
words 249 and 269 (`router-provider` 7 to 21: its factory is a module of the app's own, so its row is by hand where the
library's rows had been `known.js`'s; the two query tasks 22 to 25 each), `any` inherited 41 and 41, introduced 0 and
0, by place 27 and 27. Coverage: 121 programs and 121, all green; 190 modules drafted whole (4877 rows), 1195 `any`s
the libraries' own, none introduced, 1519 by place, as before; hand-written words 268 and 277 (the three entries that
declare their accessor in a module of the app's own, +3 each; `primitives/sse` has the words from the draft); bad
caught, a column the record did not have, 8/8. The whole draft of `@tanstack/solid-router` reproduces eleven more of
the library's own `any`s (52 to 63, counted and not held): `createRoute`, `createRootRoute` and `createRouter` are the
types' rows now, where `known.js` had written three short ones.

On 2026-11-24, later, seven items set by review were taken (`spec/rfc-declaration-types-2026-11-22.md`, *An eleventh
round*), and the suite follows each.

**In:** `router-rx-routes` (TanStack Router with `.rx` route files, on a fork's generator option; the two packages are
tarballs under its `vendor/`, installed from the task's lock, and its README says which commit, how they are remade and
why not a git dependency or a test that runs only beside a clone) and `start-mode` (Solid's own start mode with
`filesystem-routing`: `file-routes`' program served, streamed and hydrated). Both drive a dev server: an edit of a
route file is shown, and in `router-rx-routes` a reload and a route file added while the server runs — the first
three checks of that fail without 11 CP-4b's fix (a module the dev server serves twice is one module).

**Changed:** every `host.d.rx` (five) is derived from its router's own tree (`//@ routes`, 09 MO-14g) and its probe
takes the routes from `rx-verify`; the declarations of the apps' own modules over a library are `rx-declare`'s drafts
(MO-8s: `query.d.rx` in two tasks, four `router.d.rx`, Kobalte's `toasts.d.rx`); `router-code-routes` declares the 28
rows of the router it imports (`rx-declare --only`), where it kept the library's draft whole. `ssr-divergence`'s good
declaration no longer holds the lying row: it is the variant's own.

**New kinds of variant** (`run.mjs`): `gate` (refused by `rx-tsc`'s own gate: `HOST_VIEW_STALE`), `build` (refused by
`vite build`), `verify` (the checkers accept the program and `rx-verify` refuses the row: a word only running the
declaration can test), and `add` (a file added: a route file a router finds). Ten variants use them: a route file
added and the declaration not written again, a declaration edited by hand, a TSX route file handing its route another
component, what only the browser knows declared `pure`.

**The two red checks are green**, each by the means its mistake has: `duplicate-keys` by the runtime's report in a
development build (06 ST-4d), `ssr-divergence` by `rx-verify` (10 SV-7c). Neither `known` remains.

**Asked for and not added** (09 MO-11u, MO-13b; each with what was run): a row for a method of a library's object, a
layout's regions credited to its pages under `renders(H)`, an `.rx` package naming another package's host. No variant
is given up or comes back with them.

The totals, before (at `29f9106`) and now, both from a fresh `npm ci`. Tasks (35, then 37): good 111/111 and 132/132,
types 172/172 and 184/184, runtime 228/228 and 258/258, bad 199/201 and 228/228 (no red check), unrepresentable 12/12
and 13/13, hand-written words 340 and 259 (the five host declarations none; `query.d.rx` 20 to none in two tasks;
`router.d.rx` 6 to none and 13 to 6; Kobalte's `toasts.d.rx` 21 to none; the two new tasks 10 and 12), `any` inherited
60 and 57 (`router-code-routes` 19 to 16), introduced 0 and 0, by place 41 and 29 (`router-code-routes` 14 to 1:
`<RouterProvider>`'s props are the library's named type now). Coverage: 123 programs, all green; 193 modules drafted
whole (4904 rows), 1195 `any`s the libraries' own, none introduced, 1519 by place; 277 hand-written words; bad caught
13/13 — as before, entry for entry: no record moved.

**2026-11-24, a twelfth round** (spec/rfc-declaration-types-2026-11-22.md): the workspace installs the compiler with
the manifest it is published with (`compiler/scripts/published.mjs`: the runtime its dependency), where it linked the
repository's folder, so `start-mode`'s app lists no runtime and its dev-server checks hold that an app needs only the
compiler (11 CP-4a); its root is the `.rx` file, with no `App.ts` (its type probe of that file is gone: types 6 to
5). `file-routes` runs a router with a `toPath` of its own as the declaration's source (09 MO-14g: runtime 5 to 8).
Totals, at `877f72e` and now, both from a fresh `npm ci`: good 132/132 and 132/132, types 184/184 and 183/183,
runtime 258/258 and 261/261, bad 228/228 and 228/228, unrepresentable 13/13, hand-written words 259, `any` inherited
57, introduced 0, by place 29. Coverage: no record moved.

**2026-11-25, a thirteenth round** (spec/rfc-declaration-types-2026-11-22.md): `kobalte-toast` calls the library's
own `toaster` (a method has a row, 09 MO-8t: its module of the app's own is gone; bad 8 to 12, runtime 9 to 10);
`router-code-routes` has its regions in the root layout, under a host declaration read off the router its module
exports (MO-14g, MO-14h: bad 6 to 11, runtime 5 to 6); `router-rx-routes` has its outlet in a component of the app's
own (MO-14f), and a loader and a validated search in its route files (11 CP-4d, the fork's second option: types 6 to
9, runtime 14 to 17, bad 11 to 16); `router-data` calls `query.clear()` (bad 7 to 10, runtime 5 to 7);
`solid-use-primitives` imports two default exports directly (MO-8u). Six tasks lost hand-written words to `known.js`
and to the draft's own type rows (`ui-sdk-dialog` 23 to 6, `ui-sdk-forms` 9 to 2, `file-routes` and `start-mode` 12
to 9, `query-forward` 5 to 1, `router-code-routes` and `router-provider` 7 to 3, `router-rx-routes` 10 to 7).
Totals, at `93fe1df` and now, both from a fresh `npm ci`: good 132/132 and 132/132, types 183/183 and 186/186,
runtime 261/261 and 268/268, bad 228/228 and 245/245, unrepresentable 13/13, hand-written words 259 and 214, `any`
inherited 57 and 61 (`query`'s own type), introduced 0, by place 29 and 30. Coverage: 123 programs green, as before;
193 modules drafted whole, 5 105 rows (4 904), 1 197 `any`s the libraries' own, none introduced, 1 551 by place; 277
hand-written words; 21/21 bad caught (13/13: `solid-sonner/toaster`, `ui-sdk/overlays`, `solid-marked/markdown`);
three modules of the app's own gone (`solid-marked/markdown`, `solid-use/online-status`, `page-visibility`).

On 2026-11-26 the scorecard got three numbers more (09 MO-8v: `rx-declare` reads `pure`, `handler`, `draft` and
`rejects(E)` from the code that runs, and marks each row that took one `//@ inferred`). **inferred words**: the words
of a task's kept rows that the draft read from the code — a row kept as the draft writes it costs no hand-written
word, and these are counted apart, so that a word nobody wrote is not mistaken for one nobody needs. **TODOs**: the
questions the draft still asks about the rows a task keeps. And, under the table, how many of the inferred words
`rx-verify` ran against what the reading claims, and how many it contradicted — which must be none: `--check` refuses
a contradicted word, a kept row whose `//@ inferred` line is not the draft's (a claim nobody proved, or one the file
lost), fewer inferred or run words than `scorecard.json` has, and a whole draft that asks more questions than it did.
`BENCH_MARKS=1 node bench/run.mjs` writes each kept row's line again as the draft has it, in the tasks' and the
entries' own files; a `<name>.probe.mjs` beside a declaration gives `rx-verify` the arguments to call a marked row
with. No check moved: good 132/132, types 186/186, runtime 268/268, bad 245/245, unrepresentable 13/13. Hand-written
words 214 to 157, with 48 inferred beside them (43 run, none contradicted) and 57 questions in the kept rows; the
whole drafts of the tasks' modules read 808 words and ask 994 questions. Coverage: 123 programs green, 193 modules
drafted whole (5076 rows: a property that may be absent is no method's row, 5105 before), 407 words read, 979
questions asked (1215), 245 hand-written words in the kept rows (277) with 28 inferred beside them.

