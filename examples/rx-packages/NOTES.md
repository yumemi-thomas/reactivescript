# Notes: fixing what the 65 rewritten packages hit

Working notes of the pass after `REPORT.md` (b0c6aa8e). One section an item, in the order worked. Generators and matrix
results are outside the repository (`../work/gen-*.mjs`, `../work/*.json`); the numbers are here.

## 1. B2 — a `ref` closure given to a component (done)

- Rule (02 SC-4b, 07 §4): a component written in `.rx` is given `ref` as it is given `on…`, a handler. Inside the
  component a handler prop is io, as an action is: given on, or called from imperative scope; called in reactive scope
  it is refused (by name `IO_IN_REACTIVE`; carried in a record/array, off a rest or a copy of the props, through `??`,
  or given to what calls it now: `ACTION_CALLED_IN_OWNED_SCOPE`). A prop of such a name whose type, as written,
  answers a value is no handler (pure; printed `pure` in the signature): `compiler/test/names.mjs` has that program
  (`onSettled: (x: number) => string`), and refusing it would have refused correct code.
- Why sound: Solid's `ref()` → `runRefCallback` (web/src/client.ts, signals core.ts): once, as the element is made,
  untracked, writes allowed, no call when the element goes. A JS component stays by its declaration (`handler`).
- The hole was open for `on…` on main: `p.onPick(2)` typed to answer a number, `[p.onPick][0](2)` — every runner throws
  `REACTIVE_WRITE_IN_OWNED_SCOPE`, both checkers accepted.
- Runners: the interpreter and the oracle never called a `ref`; they do now (a spread's too). The server runner takes the
  frame before the `ref`s from `## Server frames`.
- 456 generated programs: checkers agree 456/456, lowering 456/456; 12 sound uses agree in interp/oracle/js/rust; 21 of
  26 unsound uses refused.
- Left open (the same for an action carried in a value, on main): a handler handed to a closure's parameter and called
  there (`[p.onPick].map(f => f(1))`, `for f in [p.onPick] { f(1) }`); given to another component's prop that is no
  handler and called there; put in a context typed `any` and called by a reader.
- Found: after hydration, what one `ref` reads of a source another `ref` wrote in the same pass is the value before
  (CSR: the write). Not ruled; a `ref` that counts writes `n := v => v + 1`.
- Found: the reference's emitter fails on `p.h ?? ((e: any) => 0)` (a typed arrow in parentheses after `??`): "Expected
  `,` or `)`"; the crate lowers it. Not fixed.
- Found: a printed signature writes a quoted key of a type as `string: string` (`"tc-button": ""` in terracotta's
  `Attrs`). Not fixed.

## 2. Bug 5 — a printed signature loses `provides` (done)

- Reduced: `component Progress(props: P) { <Root {...props} /> }` where `Root` provides to its children. Not the
  printing: the summary. A spread of the whole props was one field (`*`) that goes wherever any of Root's fields goes,
  and the meet of those is nothing. Refused in one module too.
- Fix (both checkers): a field of props spread whole on a component goes where that component's field of the same name
  goes; the summary names such a field where it differs from the spread (`...props; children: provides(…)`).
- 278 generated programs (5 roots × 12 wrappers × 4 contents, one module and two): checkers 278/278, lowering 278/278,
  no accepted program fails in a runner; the refusals are `CONTEXT_NOT_FOUND` where the children are outside the
  provision and `VIEW_NOT_SHOWN` (rx-best's rule: props with children spread on an element or copied). S-context-12.
- On the way: `crate.ts --text` draws its mutations from one seed over all scenarios, so two new scenarios moved every
  draw; one found the reference accepting a view kept in a list when a next-line character (U+0085) follows the props
  type (the crate refused). Both now read it as space.

## 3. Bug 2 — a write under an `if` that narrows its source (done)

- `if (a) { a := undefined }`, `if (a == "x") { a := "y" }`: `TS2345`, on main too. Both projections wrote
  `__.set(a)(v)` and TypeScript inferred the write's type from the narrowed read.
- Fix (ref/types/project.ts and compiler/src/project.rs, the same text): a source the module writes has
  `type __w_a = typeof a` beside its declaration and the write is `__.set<__w_a>(a)(v)`. `set<typeof a>` at the write
  does not work: TypeScript narrows a type query too (tried with tsrs). The alias is named where the nearest block that
  declares the name declares a source, so a `guess` of an equation of the same name keeps the old form.
- 213 generated programs (9 kinds of source × 7 places × 8 forms of narrowing, thinned), each with a good write and a
  wrongly typed one: types 213/213 (the good one checks, the bad one is TS2345), both projections alike 213/213.
  S-types-3 in every runner.
- **A trap found**: `tooling/rx-language-server/src/rxc.wasm` (and `words.wasm`), the copies `npm pack` makes, were left
  from the earlier packing, and `rx-tsc` prefers them to the crate's build: every `rx-tsc` run after a compiler change
  read the old compiler. Removed (ignored files); `examples/rx-packages/check.mjs` reads the built one again.
- Found: `a := p => { k: "off" }` (an arrow whose body is a record) parses, and the editor's recovering parse reports
  an error in it (`crate.ts`: "the editor's parse recovered from 1 error(s) in a program that parses"). Not fixed.

## 4a. A view context split across modules, and re-exports (left out, both)

- **A re-export** (`export { Root, Item } from "./root.rx"`): not built. The loader can resolve an importer's name to the
  module that declares it (so a context keeps its identity), and for a program of `.rx` sources that is the whole of it.
  A kit is a *package*, though: an importer reads `kit.d.rx` (a printed signature) and takes `__rx`, the module's
  factory, from the JavaScript the import names (MO-13c: `import { __rx } from "pkg/kit"`). Resolved to `root.rx`, the
  importer needs root's factory, which the package may not export at any path (`exports` in package.json), so `kit.js`
  would have to hand on each target's factory under a name, and `rx-lib` to write that, the `.d.ts` re-exports and the
  signature rows. That is MO-13's protocol in two emitters, two loaders, two signature printers and `rx-lib`: not
  provable here in the time, and half of it (sources only) would not serve the packages it is asked for.
- **An exported context that holds a view**: stays refused, for the reason proposals/27 gives (the caller's view is
  checked at the root's application against every place that shows it; a place in another module is not known there).
- What a kit in several modules has today: a namespace for each module (proposals/30), or a module of components that
  hand their props on, `export component Root(props: RootProps) { <Shell {...props} /> }` — which carries what `Shell`
  provides to its children since item 2 (it did not: bug 5), at the cost of one component a part. A view with a
  parameter through that spread is item 5's (B4).

## 4b. Function parts of a declared result: `io` (done)

- Rule (09 MO-10b, revised): a function part of a declared result is io where it answers nothing or a promise, or where
  the row marks it `io` (`write: io (t: string) => boolean`; the whole result, a tuple's item, a record's field); one
  that answers a value and is not marked is a read. Read the same bound by a name and as a field (it was: by a name,
  always io — `{ read } = make(); read()` refused where `c.read()` was not; and a void field of a fn that is no
  instantiation was called in a view unrefused). So `pure fn makeClipboard(): { read: () => string; write: io (t:
  string) => boolean }` keeps `pure`.
- The word is cut from the type TypeScript reads, as `ref` is (`typeWords`); the checker steps the marked text
  (`retIo`). Every declared fn's result type is now read at its calls (it was: an instantiation's only).
- `rx-declare` (declare-infer.js) marks a function part that is not shown to only compute, where the row writes it a
  function type, and keeps `pure`; `rx-verify`'s audit reads a marked part as no part of what `pure` claims.
- 425 generated programs: both checkers agree 425/425; 245 accepted, 180 refused, each as wanted; projection alike;
  the accepted ones type-check. S-module-49; tooling tests (declare 96, words 85, words-audit 39, generate 47, verify
  110) pass, two expectations changed (createCounter keeps `pure` with both parts marked).
- A slip caught by `test/verify.js`, not by the scenarios: the same change first made a prop typed `(n) => number` no
  longer a function-typed prop (`pure`), so a statement closure there would have been a handler by its name. Props and
  parameters keep the old test (`fnType`); no scenario holds that case (S-module-28 has `=> void` only).
- Bench (`bench/run.mjs --check --strict`: as the scorecard or better): tasks good 44/44, types 186/186, runtime
  279/279, bad 247/247, unrepresentable 13/13; hand-written words 436, inferred 12, TODOs 82 (no task's declarations
  changed). Coverage, 245 modules drafted whole (6,431 rows): 1,281 words read from the code — 943 handler, **149
  pure** (126 was recorded for the generator at a5a6f374), 145 instantiates, **40 io**, 4 provides; 877 `pure`
  questions left. The count before was not kept by the bench, so 126 is the note's, not a run of mine.
- Not done: the count over the ~4,000 packages (170 rows) was not run again; a whole result written in parentheses
  (`(() => number)`) is not marked.
