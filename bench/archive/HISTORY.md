# The benchmark's history

What the suite was, round by round, and the runs kept from it. The numbers here are those reported at the time; what
the review of 2026-11-26 found of them is in [../README.md](../README.md), *What the numbers mean*.

- `baseline-d6e640e.txt`, `scorecard-2f9baf7.txt`, `baseline-rebased.txt`: three runs, in that order.


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
words counted; `spec/archive/rfc-declaration-types-2026-11-22.md` (*A fourth round*) lists what their declarations could not
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

On 2026-11-24, later, seven items set by review were taken (`spec/archive/rfc-declaration-types-2026-11-22.md`, *An eleventh
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

**2026-11-24, a twelfth round** (spec/archive/rfc-declaration-types-2026-11-22.md): the workspace installs the compiler with
the manifest it is published with (`compiler/scripts/published.mjs`: the runtime its dependency), where it linked the
repository's folder, so `start-mode`'s app lists no runtime and its dev-server checks hold that an app needs only the
compiler (11 CP-4a); its root is the `.rx` file, with no `App.ts` (its type probe of that file is gone: types 6 to
5). `file-routes` runs a router with a `toPath` of its own as the declaration's source (09 MO-14g: runtime 5 to 8).
Totals, at `877f72e` and now, both from a fresh `npm ci`: good 132/132 and 132/132, types 184/184 and 183/183,
runtime 258/258 and 261/261, bad 228/228 and 228/228, unrepresentable 13/13, hand-written words 259, `any` inherited
57, introduced 0, by place 29. Coverage: no record moved.

**2026-11-25, a thirteenth round** (spec/archive/rfc-declaration-types-2026-11-22.md): `kobalte-toast` calls the library's
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

On 2026-11-27 the marks went, and every word is audited (09 MO-8w: `rx-declare` reads `handler` through JSX,
`uses(c)`, `provides(c)` and values made by a call; a draft has no `//@ inferred` lines). **inferred words** is now
every word of a kept declaration that the code proves, a row written by hand included: for each `.d.rx` the harness
runs `rx-declare --audit --json`, which sorts each behaviour word — `pure`, `handler`, `draft`, `rejects(E)`,
`uses(c)`, `provides(c)`, `nests(…)`, `renders(H)` — into *proven*, *contradicted* and *unproven*. Proven words are
the ones `rx-verify` holds to the reading (the "run by rx-verify" number). **A contradicted word is a problem
whoever wrote it**: `--check` refuses any (it took the place of the check that a kept row's mark was the draft's;
`BENCH_MARKS` is gone with the marks). The unproven words are written out, each with the first thing the reading
stops at — what a reviewer should check — in `bench/audit.txt` (the tasks) and `bench/coverage/audit.txt` (the
entries) by `--write`. The audit found one false word, in two declarations: `@solid-primitives/sortable`'s
`createSorted` was declared `pure` by hand and sorts its list in place under `{ dirty: true }`. Its row is `fn` now,
`primitives-state` and `coverage/primitives/sortable` call it through a module of their own (`sorted.js`, whose `pure`
the reading proves), and each holds the old row as a variant `rx-verify` must report. Every coverage entry also
waits for the page's pending timers before it looks at the console (`harness.mjs` `settled`): `ui-sdk/selection`
failed one run in a few on a warning its library gives 300 ms after mount, which was a real mistake of the entry's
program (an unnamed listbox and trigger), seen only on slow runs.
Totals, at `7afde53` and now, both from a fresh `npm ci`: good 132/132, types 186/186, runtime 268/268, bad
245/245 and 246/246, unrepresentable 13/13; hand-written words 157 and 154; inferred 48 (marked) and 71 (proven), 43
and 54 of them run (a `uses` and a `provides` rx-verify ran are counted now); questions in the kept rows 57 and 50; `any` 61 inherited, 0 introduced, 30 by place. The tasks'
audit: 71 proven, 0 contradicted, 91 unproven. Coverage: 123 programs green; 193 modules drafted whole, 5 112 rows
(5 076), 1 431 words read (407: 984 `handler`, 353 `pure`, 42 `provides`, 25 `uses`, 18 `instantiates`, 9 `draft`),
926 questions asked (979); 243 hand-written words in the kept rows (245), 38 proven beside them, 119 unproven, none
contradicted; 22/22 bad caught (21/21).

