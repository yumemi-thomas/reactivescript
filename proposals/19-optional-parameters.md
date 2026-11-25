# 19 — A trailing optional value parameter of an `.rx` fn

On `rx-best` the prototype is merged (E-9a, S-optional-1; the `branch=` verdicts below are of this tree), and it is **not published**: a local branch, `proto-optional` at 3a4847ec, on 9b765d9 (with the other two: `proto-all` at b29fa898). What is said of it was run there; the rule, the scenario and the `prototype=` verdicts are that branch's.

<!-- check prototype=ok branch=ok upstream=PARSE -->
```rx
fn add(a: number, b?: number): number => a + (b ?? 3)
export default component App() { source a := 1
  <p>{add(a)}</p> }
```

Today the argument is written: `add(a, undefined)` passes both checkers and `rx-tsc`.

<!-- types branch=ok upstream=ok -->
```rx
fn add(a: number, b: number | undefined): number => a + (b ?? 3)
export default component App() { source a := 1
  <p>{add(a, undefined)}</p> }
```

**Proposal.** `b?: T`, for a **trailing value** parameter. A call may leave it out: `f(a)` is `f(a, undefined)`. In the body it is `T | undefined`.

**Not in it.** A default (`b: T = e`): what an omitted argument, an explicit `undefined`, and a `ref` whose value becomes `undefined` each mean is not specified. An optional `ref`. A rest parameter. An action's, a closure's, a server fn's or a component's parameter.

## Prototype

**Built.** A mark on the parameter, in both parsers, the projection, the printed signature and its reading, and the tree-sitter grammar. The interpreter, the oracle, both emitters and the runtime are **unchanged**: each already passed `undefined` for a missing argument. One rule, E-9a.

**Shown** (S-optional-1, a unit on both sides, all runners; `rx-lib` and a TSX caller by hand).

- A lifted call without it is an equation over its arguments (E-2). An instantiation snapshots what it is given, and an argument left out is nothing to snapshot (E-10). A reactive argument in its place is `SNAPSHOT_ARGUMENT`, as before.
- The same through a record (`ops.plus(n)`), through a printed signature (`add(a: number, b?: number)` reads back to the same verdicts), and from TSX, for a fn and for one that instantiates. The `.d.ts` says `b?`.
- A body that reads it as `T` is TypeScript's TS18048. A required parameter, or a `ref` one, after it is `PARSE` and says E-9a.

**Cost.** 1 rule. Lines that are not tests: 22 in the crate (parser, AST, signature, projection), 6 in `ref/`, 1 of grammar. Checking time, compiled code and the runtime: the same.

**Changes.** Over 2,228 modules and programs of this tree and of upstream's, checked and compiled for both targets: only this file's first program.

**What it gives, counted again.** **What it did not give:** no facade line goes away, and by itself it helps 34 of the 192. The *63* said here before was too many, and counted rest parameters.

| of 192 surveyed primitives | |
| --- | --- |
| an optional value parameter, and nothing else in the list that `.rx` lacks | **34** |
| with type parameters too (needs [20](20-generic-fns.md)) | 12 |
| an **optional accessor**: an optional `ref`, not in it | 31 |
| a rest parameter, or overloads | 25 |

Of the 34, a stub `.rx` fn with the published list was built by `rx-lib` for each: the `.d.ts` takes every argument the original takes for 33. The other one, `createUndoHistory`, does in its rewrite.

In the twelve rewrites: **no facade line goes away** (198 before and after). Each facade that reads an options record has another reason to be there. Four calls the originals allow and the derived `.d.ts` refused (`createMediaQuery("x")`, `createPrefersDark()`, `createUndoHistory(s)`, `createPresence(x)`) are accepted, and three of `sortable`'s.

**Questions.**

1. An optional `ref`: 31 of the 192 want one, as many as the proposal helps. An absent accessor, or an accessor of `undefined`?
2. A fn given by name to `map` gets the index too. Adding `b?: number` to a fn that is used so changes what it answers, and nothing says so. TypeScript has the same hole.

<!-- frames prototype=pass branch=pass upstream=fail -->
```rx
fn add(a: number, b?: number): number => a + (b ?? 100)
export default component App() { <p>{map([1, 2], add).join(",")}</p> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `1,3` |

**Verdict: worth proposing.** It is small, sound, and needs no new reading of any rule. It is a convenience: the way round is one word.
