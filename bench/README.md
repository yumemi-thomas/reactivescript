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
linked in as an app would install them. `scripts/setup.sh` builds all but the
last.

## What a task is

A folder under `tasks/`: `src/` is the app, `task.mjs` says how it is judged.

- **The good program** (`src/`) is a realistic job: the libraries are the
  ones npm has (Solid 2.0, Formisch, TanStack Query, Router, Start and Table,
  Kobalte), imported by their own names, declared in `rx-types/` as a project
  declares a package that ships no `.d.rx` (09 MO-8k), and typed by the
  library's own TypeScript types.
- **The bad variants** are that program with one line changed into a mistake
  a Solid user makes: a read with no boundary, a value frozen where it should
  follow, a write while the view computes, a value that escapes where the
  library checked it.

and four columns score it:

| column | green when |
| --- | --- |
| **good accepted** | the crate and `ref/` both accept the program, and agree |
| **types kept** | `rx-tsc` is clean with the library's own types; the `.rx` writes no `any`; and each *type probe* — a mistake only the library's real type can refuse (a field path the schema has not, a link to no route) — is refused by TypeScript. A probe that passes means the type was lost on the way |
| **runtime ok** | the compiled program does the job: rendered on the server and/or driven in Chromium on Solid's development build, with no console error or warning |
| **bad caught** | each variant is refused by both checkers, with the diagnostic named, by a diagnostic the good program does not have. Where only the run can know (a duplicate key computed at run time, a `pure` JS function that answers differently on the server), the variant must compile and then fail loudly in development (`dev`); where the language makes the mistake harmless instead of refusing it (a draft's row kept by a callback is a copy), the variant may compile and must then behave (`orSafe`); advice that never fails a build is `advise` |

Nothing in a task names a rule of the checker: the programs come from the
libraries' documentation and from what goes wrong in Solid apps, and the
expected diagnostics are the ones the language already has for the mistake
(or the one its spec says it should have). A fix to the compiler follows from
a rule in `spec/`, never from a task.

## The tasks

| task | the job | the mistakes |
| --- | --- | --- |
| `formisch-field-path` | a Formisch form whose fields are named by typed paths into a valibot schema | a schema that reads state, a form made in the view, a write while the view computes |
| `query-forward` | a TanStack Query result passed down: its data to a list, a flag to a badge, the whole result to a panel | `data` read under no boundary, the result handed on by `valueOf()`, in a record, to a child that takes it for plain data |
| `router-provider` | TanStack Router's provider inside the app's own `Shell` component, in a module of its own | a page that fails with no boundary at the outlet, a hook outside the provider, a router never rendered |
| `store-updater` | a Solid store updater written once and used by two handlers; a snapshot read out of the draft | the store written outside its setter, the updater called by hand, live rows kept by a `forEach` callback, the draft's iterator kept, an `await` in the updater |
| `start-route` | a TanStack Start file route rendering `.rx` components, served and hydrated at `/people/2?tab=role` | the page's data with no boundary, state written while a page renders, a param copied into state |
| `table-pagination` | a TanStack Table: cell components, pagination buttons, a pager component given page numbers and handlers, a row's id handed up | the table or a row handed to a child or up through a callback, kept in state, a cell's context missing, a page turned while the view computes |
| `kobalte-dialog` | a controlled Kobalte dialog | a part outside its root, a part the kit has not, a write while the view computes, a stale read of an own write |
| `frozen-read` | formatters kept in a record, read by the view, by a primitive and by a seed | a formatter read under a kept `peek`, given to a value parameter, used as a seed, through an array |
| `source-mutation` | a list in a source, added to by a write and sorted for display | `rows.push(…)`, a prop sorted in place, a row written through a local alias |
| `listener-cleanup` | a JS listener whose disposer the mount effect returns | the disposer dropped: in the effect, in a handler, in a local never used |
| `duplicate-keys` | a keyed list whose rows keep their state across a reorder | two literal rows with one key; a row added at run time with a key the list has |
| `sequential-awaits` | an action whose second load needs the first's answer, the independent one asked beside them | two independent loads awaited one after the other (advice) |
| `ssr-divergence` | a value only the browser knows, asked as a client question | the question read with nothing to hold it, client JS called for its value, a `pure` JS call that answers differently on each side |

## The scorecard

`scorecard.txt` is the last run committed, `scorecard.json` the same as data
(what `--check` compares with), and `baseline-d6e640e.txt` the run at the
commit this suite was first written against: what the language did before any
of the work the suite drove. A failure that stays is listed in its task's
`known`, with the reason: the rule of `spec/` that makes it one.
