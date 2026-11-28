# 23 — Refuting a declaration by running it (tooling)

Needs whatever words are taken. Proposed: the tool that refutes. **Not proposed: a gate that certifies** (`rx-tsc --rx-strict`); the prototype has it.

A row is an assertion (CN-5). Nothing says that it is false. `rx-verify kit.d.rx` runs each claim against the module:

<!-- tool branch=failed upstream=- tool=verify args=kit.d.rx says-branch="sorted: declared pure, but when it is called it changes what it is given" -->
```text
export default component App() { <p>a</p> }
-- file: ./kit.js
export function sorted(xs) { return xs.sort(); }
export function twice(n) { return n * 2; }
-- file: ./kit.d.rx
export pure fn sorted(xs: number[]): number[]
export pure fn twice(n: number): number
-- file: ./kit.probe.mjs
export const probes = { sorted: { args: () => [[2, 1]] } };
```

```text
kit.d.rx:1 MISMATCH   sorted: declared pure, but when it is called it changes what it is given ([2,1] to [1,2])
kit.d.rx:2 read       twice: pure is read from the code (its own code only computes: what a getter or a callback among its arguments does is the caller's), which was not run
```

- **A run refutes; it does not show.** A `pure` is never `held`, by a run or by a reading. An earlier version recorded `held` for `twice(o) { return o.a + o.a }`, with a getter that counted; a record says `read` now:

<!-- tool branch=ok upstream=- tool=verify args=kit.d.rx says-branch="kit.d.rx:1 read" -->
```text
export default component App() { <p>a</p> }
-- file: ./kit.js
export function twice(o) { return o.a + o.a; }
-- file: ./kit.d.rx
export pure fn twice(o: { a: number }): number
```

- For the other words, evidence is the claim's own, and a held result is run again over a module changed so that the claim is false.

**Evidence (author-selected).** 350 claims of the benchmark's own rows, 0 mismatched. What it found: 7 false `ref`, 2 false `uses` in drafts (archive, not re-run), and a hand-written `pure` that sorted in place.

**Cost.** 1,137 lines; an author writes a probe for each package, longer than the rows.

**Prototype.** MO-8j, 13 TY-7 (proposed ids).
