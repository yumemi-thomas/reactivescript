# Contributing

ReactiveScript is an early-stage language design. The spec is the product;
the reference implementation in `ref/` exists to check it.

## How claims are made

Every behaviour claim is either a numbered rule (`E-n`, `H-n`, `AC-n`, …;
see the README's *Rule IDs*) or a scenario under `scenarios/`
(program → actions → frames → verdict). A change to the language comes
with the rule it adds or amends and at least one scenario that shows it.
`scenarios/TEMPLATE.md` is the starting point for a new one.

A word or a form of a JS declaration (`.d.rx`) is held to the bar of
`spec/09-modules.md` MO-8r: without it a correct Solid program that people
commonly write cannot be written, or a mistake Solid programs really make
cannot be refused, and more than one library writes it. The libraries
counted are the Solid 2 ecosystem's releases on npm — a pre-release (an
alpha, a release candidate) counts as a stable one does — and not only
those the benchmark covers (ruled 2026-11-24). Expressing one
package's API is not a reason: that package is left undeclared, wrapped in
a module of the app's own, or typed by its own `.d.ts`. A word that is
withdrawn is refused by name in both declaration parsers, with what to
write instead, and the benchmark lists each check given up with it
(`bench/README.md`).
The evidence is programs built and run against the libraries npm has, not
types read: 09 MO-14 (a host declaration, 2026-11-23) records what was
built for two routers before the form was taken, and what each fallback
did; MO-14f, what the checker before it said of the same programs. A
library's component is counted for what it is: where one rule serves two
libraries at one place and a single library at another (a layout's
outlet), the record says so.
A mistake the checkers accept in silence is a defect whatever the bar
says of the word that would have named it: it is refused (09 MO-11i's
`NESTED_NOT_RENDERED`), and the word is decided apart.
A word that comes in names its evidence the same way: 09 MO-8r's table
for `renders(H)` (2026-11-24) lists three libraries by three authors,
each with the release that was run and what the run showed, and the
benchmark holds a program for each (`bench/tasks/kobalte-toast`,
`router-code-routes`, `bench/coverage/solid-sonner/toaster`). A claim a
row makes that running can test is `rx-verify`'s to test: where a
component renders what it is given (a scene), that a library does
not call a component it is given with no owner at all, and that a `pure`
fn answers alike with a window and without one (10 SV-7c).
A word a tool writes into a row is held to a harder bar than one a person
writes: it is written only where the code proves it (tooling/rx-language-server/DECLARATIONS.md, MO-8v: `pure`,
`handler`, `draft`, `rejects(E)`; MO-8w: `handler` through JSX,
`uses(c)`, `provides(c)`, a value made by a call — read by `rx-declare`
from the JavaScript an import resolves to), and "probably" is a refusal.
A change to that reading (`tooling/rx-language-server/src/infer.js`)
comes with the function that shows it in `test/infer.js`,
`test/infer-called.js`, `test/infer-owner.js` or `test/infer-view.js` — on the refused side, a function that does the one
thing the word must not cover, hidden as code hides it; on the proven
side, its honest twin — and the benchmark holds three numbers against
it: no word read from the code is contradicted when `rx-verify` runs it,
no word of a kept declaration is contradicted by the code (the audit,
`rx-declare --audit`: a word written by hand is held as one a tool
wrote is), and no whole draft asks more questions than the record has.
A word the audit cannot prove is listed with what stands in the way
(`bench/audit.txt`, `bench/coverage/audit.txt`): that list is what a
reviewer of the declarations has left to read, and a word comes off it
by being proven, or by being checked and said so in the file.
"Contradicted" is kept for what the code shows the opposite of: a
reading that merely does not follow something (a library's own scope
that is no Solid context, a prop that may hold a view) is "unproven",
with the thing to check.
A number says what it counts: a check is one fact, an `any` is counted
where it stands, a claim has one result, and what could not be measured
is a failure and not a zero (`bench/measure.test.mjs`).
`spec/` holds the rules; what was measured, rejected or withdrawn goes to
`spec/archive/`, and how a tool does its work beside the tool.
A part of the reading that proves nothing on the ecosystem's code is
deleted (DECLARATIONS.md's table, each part switched off in turn).
A reason a word is refused is recorded as an example, not a count
(`rx-declare --why`).
A form that is asked for and not taken is recorded the same way, with
what was run: 09 MO-11u's three (2026-11-24) — a row for a method of a
library's object (run: of the two libraries named, one renders what it
is given beneath its list and the other calls it with no owner), a
layout's regions under `renders(H)`, an `.rx` package naming another
package's host.
A form that was not taken is taken when what it is counted over changes,
and the record keeps both counts: a row for a method of a library's
object was refused on 2026-11-24 as a place for `renders(H)` alone (true
of one library) and accepted on 2026-11-25 as the row itself, every word
a fn has (09 MO-8t: six libraries export an object whose methods do
something, four run with the method called while a view computes, which
both checkers accepted).
A strict ruling is read again for the correct program it refuses: where
the checker can see what it said it could not, the ruling is revised with
its unit and the condition that keeps it sound, and the counter-examples
stay as tests (09 MO-11c, a record of components by a name; MO-14f, the
host's outlet through `.rx` components; MO-14h, a page under code-based
routes).
What looks like a limit of the notation is tried before it is recorded:
a module's default export was listed as having no row for three rounds,
and `import { default as x }` with a row named `default` had always
parsed, checked and run (09 MO-8u) — only the draft said otherwise.
What a tool can read is not a word's to say: a host declaration's
nesting is read off the router's own tree (`//@ routes`, 09 MO-14g). That
is not the checkers' (08 CN-8): they check the rows they are given.
A generated declaration holds only words proven from the code by a
general rule (ruled 2026-11-24): none off a name, a shape, a run or a list
of libraries, and wrong stays at zero. A rule that writes one is tested on
the refused side first, and rx-verify is run over the drafts of every
module (`bench/needed.mjs` and spec/archive/generated-words-2026-11-24.md
say how). A word a person writes is kept apart: one nothing has shown
stays only where a correct program of the benchmark is refused without it,
listed in `bench/needed.txt` as that app's own claim.
A library that is not released as the benchmark needs it is used from
the lockfile all the same, as packed tarballs with the commit they were
built from (`bench/tasks/router-rx-routes/vendor`): a test that runs
only beside a clone is green in CI by not running. A change to such a
fork is pushed to the fork's branch, never forced, and the tarballs are
packed again at the new commit with their integrities in the task's lock
(the vendor folder's README says the commit and the commands); what the
fork would need upstream is written as a proposal, with its test, in
`spec/archive/rfc-declaration-types-2026-11-22.md` (*Proposed upstream*), and
sent by a person.
What an app must install is tested as installed: the compiler goes into the
suites' workspaces with the manifest it is published with
(`compiler/scripts/published.mjs`: the runtime its dependency, Solid its
peer; not committed to `package.json`, as the platform packages are not),
and `compiler/test/runtime-resolve.mjs` runs an app that lists only the
compiler under three installs (11 CP-4a).

Decisions recorded in the spec as *ruled* with a date are settled; please
open an issue rather than a PR to revisit one. Decisions marked *taken by
default* are still open to change.

Semantics follow Solid 2.0 (`solidjs/solid@next`, pinned in
`ref/SOLID_NEXT`). An open question in Solid's
`packages/signals/docs/RULES-FUNDAMENTALS.md` is open here too. Where this
spec diverges from Solid, the divergence is recorded as a `DV-n` in
`spec/05-holds.md` or `spec/10-server.md`.

The checker of types is tsrs at the version
`tooling/rx-language-server/package.json` pins, and nothing else
(`tooling/rx-language-server/README.md`, *The checker*): no tool asks
another TypeScript for a verdict, and none falls back to one. A new
version of it is a change of verdicts: before an expected result is
changed, the old and the new answer are compared over the benchmark's
probes, `npm run types` and the drafts of every module of the coverage
suite, and each difference has a minimal program, a cause and a verdict
(`spec/archive/ts7-tsrs-2026-11-24.md` is the record of the first). A
difference that refuses a correct program, accepts a wrong one, widens a
drafted type or varies from run to run blocks it. `test/checker.js` holds
the differences the tooling stands on, so that a version that has lost
one says so.

## Running the suite

Solid is built from its `main` branch at the pinned commit (needs Node 22+,
pnpm, a Rust toolchain and the network). `scripts/setup.sh` does every step
from a fresh clone: Solid beside this repository (`../solid-next`), `ref/`'s
links to it, the crate (its Node-API binding, `rxc` and the WebAssembly build the language server reads), the runtime, the
language server, and Playwright's Chromium for the browser suites.

```sh
sh scripts/setup.sh            # or, for ref/ alone: sh ref/scripts/solid-next.sh && (cd ref && npm install)
cd ref
npm test                       # interpreter over every scenario
npm run oracle                 # the same scenarios lowered onto Solid
npm run compiled               # compiled modules
npm run ssr                    # streamed SSR + hydration in Chromium (several processes: RX_JOBS, default 4)
npm run types                  # TSX projection checked by TypeScript
npm run crate                  # the Rust crate against ref/ (also --spa, --whole-program, --lower, --project; --text, alone or with the last two: the programs again with é, 漢, 😀, CRLF, cut short)
```

The crate, the plugin, the runtime and the tooling, from the repository's root:

```sh
(cd compiler && cargo test --release)
for t in vite wardic formisch ssr-router start vite-types vite-gate drafts confined leaks js-host lib runtime-resolve; do node compiler/test/$t.mjs; done   # SOLID_NEXT=<checkout> for vite.mjs when Solid is not at ../solid-next (a nested worktree); vite.mjs installs TanStack Router's Vite plugin once into compiler/test/.out (examples/tanstack is built with it); `node compiler/test/vite.mjs context` is the dev server after an edit (11 CP-4b)
# with a Solid plugin that has context.resolve and Frontend.buildStart (compiler/README.md):
for t in vite-hosts vite-watch; do SOLID_VITE_PLUGIN=<checkout> node compiler/test/$t.mjs; done   # git clone -b frontend-resolve https://github.com/yumemi-thomas/solid-vite-plugin && pnpm install && npx rolldown -c
(cd tooling/tree-sitter-rx && pnpm install && pnpm run generate && pnpm test && pnpm run parse:repo)   # a new form in .rx or .d.rx needs its grammar
(cd runtime && node test.mjs)
node --experimental-strip-types compiler/test/names.mjs   # every function of the language under every kind of binding: a name is its binding's (09 MO-1d)
(cd tooling/rx-language-server && npm test)   # its suites at once, RX_JOBS at a time (scripts/parallel.mjs); ref's `npm run types` asks its checker too: npm ci there first
node scripts/spec-refs.mjs       # every rule and diagnostic that is named is in spec/
node proposals/check.mjs         # every program in proposals/ has the verdict stated for it (--upstream <an exported, built main>: there too); not in CI
node bench/measure.test.mjs      # the benchmark's own counting
node bench/run.mjs --check     # BENCH_JOBS processes (default: half the cores); the representative tasks and the coverage suite (bench/README.md): real libraries, good programs and one-line mistakes; every package of four libraries drafted and used
node bench/run.mjs --write     # after a change that is meant to move it: the scorecard and the coverage record, from a fresh install (rm -rf bench/.out)
BENCH_WORDS=1 node bench/run.mjs <task>   # each row of the task's declarations written by hand, beside rx-declare's row of the same export; and each row with an inferred word that rx-verify did not run
node bench/needed.mjs --write             # the hand-written words no tool has shown, and the diagnostic a program gets without each (--apply takes off those none needs)
node --experimental-strip-types bench/generated.mjs   # no program is refused by a generated declaration that is accepted with none (MO-8l); --package <spec> <dir>: the same over one package
npx rx-declare <module> --why             # each word read from the code: what proved it, or the first thing in the way with its file and line
npx rx-declare --audit <file.d.rx>        # every word a declaration has, whoever wrote it: proven by the code, contradicted by it (exit 1), or neither — with what to check (09 MO-8w); the benchmark writes the lists (bench/audit.txt, bench/coverage/audit.txt)
# a task under a file-based router generates the router's tree before any checker reads the program (its `prepare`: a
# `vite build`), and its host.d.rx is derived from that tree: `rx-declare --host --sync <host.d.rx>` after a route moves
```

### Faster runs

```sh
scripts/quick                  # while working: both checkers and their parity over every program, the interpreter, the oracle, both emitters, the crate's tests, and in the browser and the benchmark what is new
scripts/ci                     # everything, nothing kept from before: the run before a push. --list, --only a,b, --skip a,b, --jobs n, --cached
node scripts/matrix.mjs <folder of scenarios> [--rev before=<checkout> --rev after=<checkout>]   # small programs through every runner and what each shows; two revisions compared
node scripts/heavy.mjs <name> -- <command…>       # any command under the machine's lock; --who: who holds it
```

- **Results kept.** The benchmark's tools and pages (`bench/run.mjs`,
  `bench/generated.mjs`), `ref`'s `npm run ssr` and `proposals/check.mjs`
  use a result again when nothing that could change it has
  (`scripts/lib/cache.mjs`): the key is the content of the files it reads,
  of the install, the runtime, Solid, the tools and the harness, with the
  versions, the flags and the environment; the compiler is not in it, but
  asked again — what a tool or a page asked of the crate must be answered
  as it was. Both checkers are run every time. Only a check that passed
  is kept; one that looks at a moment in time, Vite's suites and the
  crate's own are not. `--no-cache` or `RX_NO_CACHE=1` runs everything;
  `--write` does, CI does, and `scripts/ci` does: **a run before a push
  uses nothing kept.** The results are in `RX_CACHE_DIR` (macOS:
  `~/Library/Caches/reactivescript-results`), shared by every checkout, at
  most `RX_CACHE_MB` (512); deleting the folder is safe. `RX_CACHE_LOG=<file>`
  writes each hit and miss, `RX_CACHE_KEYS=1` with the misses' keys.
- **One heavy run at a time.** A whole benchmark, `generated`, and
  `scripts/ci`'s steps with several browsers take a lock of the machine's
  (`scripts/lib/lock.mjs`) and wait for it at most `RX_LOCK_WAIT` seconds
  (3600), then go on. A holder that is gone holds nothing; one whose
  processes do nothing for 180 s (`RX_LOCK_IDLE`), or that has held it 2400 s
  (`RX_LOCK_HOLD`), loses it to the next. Off in CI and
  under `RX_LOCK=0`; a run of one task does not take it.
- A new suite that keeps results says in its key everything it reads: a
  key that leaves something out is a check that no longer checks. The
  crate's answers belong in the trace, not the key.

`ref/README.md` describes each runner. Please run the suite before opening a
pull request and note any scenario whose result changed.

## Issues

Bug reports and questions are welcome as GitHub issues. For a semantics
question, a small `.rx` program and the frames you expected is the most
useful form.
