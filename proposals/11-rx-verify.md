# 11 — Verifying a declaration by running it (tooling)

Depends on the words taken in 02, 05, 06, 07 and 08.

## Problem

A row is an assertion (CN-5). Nothing says that it is false. `export pure fn sorted(xs)` over `xs.sort()` is accepted, and
changes a source in place.

## Proposal

`rx-verify kit.d.rx` takes each row apart into claims, and runs each against the module. A result is about one claim:
`held`, `mismatch`, `unverified`, or not applicable.

<!-- tool branch=failed upstream=- tool=verify args=kit.d.rx says-branch="pure is contradicted by the code" -->
```text
export default component App() { <p>a</p> }
-- file: ./kit.js
export function sorted(xs) { return xs.sort(); }
export function twice(n) { return n * 2; }
-- file: ./kit.d.rx
export pure fn sorted(xs: number[]): number[]
export pure fn twice(n: number): number
```

```text
kit.d.rx:1 MISMATCH   sorted: pure is contradicted by the code: it changes its argument `xs` in place (.sort()) [kit.js:1]
kit.d.rx:2 held       twice: pure is proven by the code (it only computes), which was not run
```

- **Arguments come from a probe** (`kit.probe.mjs`), written by the app's author. With none, the claim is `unverified`.
- **Evidence is the claim's own.** `uses(c)` needs a failure with no provider, a clean run under one, and a failure again
  with `c`'s alone taken away. `pure` can be refuted by running, not shown: it is held where the code proves it and no run
  refutes it. `ref` answers alike when read twice. `handler` is not called while the call runs. `pending` is seen to wait.
- **The evidence is tested.** What a run holds is run again over the module changed so that the claim is false. If it holds
  there too, it is `unverified`.
- **A strict project** (`rx-tsc --rx-strict`) asks that each row it imports be recorded (`rx-verify --record`). The record
  is keyed by the row's text, the checks' version and the library's version. Otherwise `UNVERIFIED_ROW`.

## Evidence

`bench/scorecard.txt` and `bench/coverage/coverage.txt`, held by CI at a349e48. A claim is one word of one row:

| | claims | proven by the code | held by a probe that fails over a changed module | the author's own | mismatched |
| --- | --- | --- | --- | --- | --- |
| tasks | 182 | 77 | 92 | 13 | 0 |
| coverage entries | 168 | 55 | 99 | 14 | 0 |

- The 27 that are the author's own are in `bench/needed.txt`, with the diagnostic a program gets without each.
- What it found: 7 false `ref`s, 2 false `uses` in drafts (the archive's count, not re-run); `createSorted` of
  solid-primitives declared `pure` by hand, which sorts in place under an option.
- What testing its own evidence found: results that were held by a run that could not have failed. Records made before do
  not count any more (record version raised). How many was not kept.

## Cost

- `bin/verify.js` 554 lines, `verify-place.js` 416, `verify-mutate.js` 72, `strict.js` 95.
- The author writes a probe for each package. In the benchmark, they are longer than the rows.
- It runs the package, in node or happy-dom: a package that needs a browser's layout is `unverified`.

## What it does not do

- It does not show that a row is true. It shows that a run agrees, and that the run could have disagreed.
- Not `renders(H)` or placement with no scene in the probe.
- Two modules of 199 are not run at all (one needs Tauri; one stops the verifier). Record, not re-run.

## Alternatives tried and rejected

- *One result for a row.* It certified claims that nothing had tested (found by review, e3d3cb7). A claim has a name now.
- *`trusted` on a row,* to pass strict mode. Withdrawn: every row would have it.
- *Writing words from a run.* A run refutes; it does not prove. The tool only reads.
- *One mutation for each claim.* Where no change makes a claim false (`exists`), it is not tested so.

## Compatibility

None: a tool. Strict mode is a project's choice.

## Open questions

- Is strict mode useful without probes shipped by packages?
- The probe's format is a second thing to learn. Could a package's own tests be the probe?

## Prototype

MO-8j, 13 TY-7. `tooling/rx-language-server/test/verify.js`. 8d276cc, a5879ee, e3d3cb7, 1f73c9a.
