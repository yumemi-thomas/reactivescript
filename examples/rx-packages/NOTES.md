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
