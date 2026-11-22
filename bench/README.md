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
node bench/run.mjs --write         # write bench/scorecard.json and bench/scorecard.txt from this run
```

It needs the crate (`cargo build --release` and `npm run build` in
`compiler/`), the runtime (`npm run build` in `runtime/`), the language
server's packages (`npm ci` in `tooling/rx-language-server`), Node 22.6 or
later, and the network once: `bench/package.json` is installed into
`bench/.out/ws`, with this repository's compiler, runtime and language server
linked in as an app would install them (a task with a `package.json` of its
own beside its `task.mjs` has an install of its own, for a library that pins
another version: TanStack Start pins its router). `scripts/setup.sh` builds all but the
last.

## What a task is

A folder under `tasks/`: `src/` is the app, `task.mjs` says how it is judged.

- **The good program** (`src/`) is a realistic job: the libraries are the
  ones npm has (Solid 2.0, Formisch, TanStack Query, Router, Start and Table,
  Kobalte), imported by their own names, declared in `rx-types/` as a project
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
| **bad caught** | each variant is refused by both checkers, with the diagnostic named, by a diagnostic the good program does not have. Where only the run can know (a duplicate key computed at run time, a `pure` JS function that answers differently on the server), the variant must compile and then fail loudly in development (`dev`); where the language makes the mistake harmless instead of refusing it (a draft's row kept by a callback is a copy), the variant may compile and must then behave (`orSafe`); advice that never fails a build is `advise` |

| number | what it counts (lower is better) |
| --- | --- |
| **hand-written `.d.rx` words** | for every `.d.rx` of the task, the words a person wrote on top of what `rx-declare` drafts for the same module (run by the suite, with the flags the task's `declare` names: `--run --dom` where the draft was made by running the package). A row the draft has word for word costs nothing, a row it has otherwise costs the words that differ, a row it has not costs every word; rows left out cost nothing. It is what an app pays to use the library |
| **`any` inherited** | the `any`s those files hold that the library's own declaration has at that place (09 MO-8q): for an export, as many as `rx-declare`'s draft of the same export writes for the library's own (`rx-declare --causes`, cause `vendor-any`). They are reproduced, not narrowed |
| **`any` introduced** | every other `any` those files hold: written where the library has a type. It must be none. One that cannot be named yet is listed in `any-allowlist.json` — the task, the file, the export, how many, a one-line reason and what blocks naming it — and nowhere else |
| **by-place** | the parts those files say by their place in the library's declaration (`Parameters<typeof import(…)>`, `ReturnType<…>`): a type in name only, counted apart so that it is not a way around the rule above |

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

## The tasks

| task | the job | the mistakes |
| --- | --- | --- |
| `formisch-field-path` | a Formisch form whose fields are named by typed paths into a valibot schema | a schema that reads state, a form made in the view; *(unrepresentable)* a write while the view computes, state assigned with `=` |
| `formisch-field-array` | a Formisch array field: rows inserted, removed and moved by the library's methods | a method called while the view computes or given to a button called, the form made in the view, the row ids changed in place |
| `query-forward` | a TanStack Query result passed down: its data to a list, a flag to a badge, the whole result to a panel; a refetch; a failing query | `data` read under no boundary, the result in a record, to a child that takes it for plain data |
| `query-mutation` | a TanStack Query mutation that invalidates its query; the cache sent from the server and taken up in the browser (dehydrate / hydrate) | a query key that lacks what the query's function reads, the mutation run or the cache invalidated while the view computes, a hook outside the provider |
| `router-provider` | TanStack Router's provider inside the app's own `Shell` component, in a module of its own | a page that fails with no boundary at the outlet, a hook outside the provider, a router never rendered |
| `router-data` | `@solidjs/router` 2.0's data layer: a `query()` a page reads, a form action, `useSubmissions`, `revalidate` (2.0 has no `createAsync` nor `useSubmission`: a query is read by an equation that awaits it) | an async read with no boundary, `revalidate` called while the view computes, a submission's input or a query's answer kept in state |
| `start-route` | a TanStack Start file route rendering `.rx` components, served and hydrated at `/people/2?tab=role` | the page's data with no boundary, a param copied into state; *(unrepresentable)* state written while a page renders |
| `store-updater` | a Solid store updater written once and used by two handlers; a snapshot read out of the draft | the store written outside its setter, the updater called by hand, an `await` in the updater, a closure that writes the draft later |
| `store-helper` | a Solid store's draft changed in place by a helper written in JS (`moveItem(d.columns, from, to)`) | the helper given the store itself, called while the view computes, the draft kept by a closure |
| `table-pagination` | a TanStack Table: cell components, pagination buttons, a pager given page numbers and handlers, and — shadcn/ui's `DataTablePagination` — a component given the table itself | a row handed up through a callback, the table kept in state, a cell's context missing, a page turned while the view computes |
| `kobalte-dialog` | a controlled Kobalte dialog | a part outside its root, a write while the view computes, a stale read of an own write; *(unrepresentable)* a part the kit has not, a write to derived state |
| `kobalte-select` | a Kobalte Select whose options are objects, each rendered by an `.rx` component | an item outside the select, the options sorted in place, a write while the view computes |
| `primitives-virtual` | solid-primitives' listeners and resize observer and a TanStack Virtual list, on an element ref | a listener's disposer dropped (its type an alias), a primitive made in a handler; *(unrepresentable)* the ref read before there is an element |
| `frozen-read` | formatters kept in a record, read by the view, by a primitive and by a seed | a formatter read under a kept `peek`, given to a value parameter, used as a seed |
| `source-mutation` | a list in a source, added to by a write and sorted for display | `rows.push(…)`, a prop sorted in place, a row written through a local alias, the value a functional write is given reversed in place |
| `keyed-edits` | a keyed list edited every way: insert, remove, move, rename in place, reset | rows written out with one key in a handler, rows keyed by their index, a row written through the loop's name |
| `listener-cleanup` | a JS listener whose disposer the mount effect returns | the disposer dropped: in the effect, in a handler, in a local never used |
| `duplicate-keys` | a keyed list whose rows keep their state across a reorder | two literal rows with one key; a row added at run time with a key the list has |
| `effect-derived` | a total that is an equation, a history the clicks write, an effect for what leaves the program | the total kept in a source by an effect (with and without inputs), a history appended by an effect, a mount effect that reads what it never hears of again |
| `projection-selection` | a selection as a projection (`draft(…)`, Solid's `createProjection`): picking a row tells two rows | the selection kept in a store by an effect, the projection written from a handler |
| `optimistic-todo` | an optimistic add: a guess, the server asked, the list asked again, a refusal taken back | a guess where nothing is awaited, an `await` before the guess, the answer written to, a failure let out |
| `context-provider` | a context of the app's own, a provider component holding the state, readers under it | a reader beside or above the provider, the provided state written or changed in place, the provided action called while the view computes |
| `sequential-awaits` | an action whose second load needs the first's answer, the independent one asked beside them (asserted: two calls in flight at once) | two independent loads awaited one after the other (advice) |
| `rx-package` | a library written in `.rx`, built by `rx-lib` and installed as a package (its `dist/` only): used by an `.rx` app, checked against the shipped `.d.rx`, and by a `.tsx` Solid 2 app type-checked by plain `tsc` against the shipped `.d.ts`; both served, hydrated and driven in Chromium. The run also holds that each verdict against the shipped `.d.rx` is the verdict against the package's source, and that no word of that `.d.rx` is written by hand (it is the text both checkers print); that the `.tsx` app's server render is a plain `renderToStream` (and the same inside a request event), that two renders at once each have their own instance of the package's state, and that an `.rx` program and JavaScript in one page share one (09 MO-13g) | the package's component outside its provider, its context provided beside the reader, its rate read where one failure gets out, its failing component under no boundary, its source written, a plain source asked again, its action called while the view computes, its primitive called in a handler, its rows restated at the import |
| `ssr-divergence` | a value only the browser knows, asked as a client question | the question read with nothing to hold it, client JS called for its value, a `pure` JS call that answers differently on each side |

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

Two checks are red in `scorecard.txt`, each with its reason in its task's `known`: a duplicate key computed at run
time (`duplicate-keys`) and a `pure` JS call that answers differently on the server (`ssr-divergence`). One run check is red with its reason too: Kobalte's own read of a store row in an
effect's callback, which Solid's development build warns of (`kobalte-select`).
