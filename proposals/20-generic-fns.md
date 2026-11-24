# 20 — Generic `.rx` fns, with inferred calls

The prototype is not in this tree, and it is **not published**: a local branch, `proto-generic` at b36ab25d, on 9b765d9 (with the other two: `proto-all` at b29fa898). What is said of it was run there; the rule, the scenario and the `prototype=` verdicts are that branch's.

Type parameters at the declaration, and no type arguments at a call.

<!-- check prototype=ok branch=PARSE upstream=PARSE says-upstream="near '<T>(xs: T[]): T" -->
```rx
fn first<T>(xs: T[]): T => xs[0]
export default component App() { <p>{first([1])}</p> }
```

<!-- types branch=TS7006 upstream=TS7006 -->
```rx
fn first(xs) => xs[0]
export default component App() { n: number = first(["a"])
  <p>{n}</p> }
```

**Proposal.** `fn first<T>(xs: T[]): T`, with constraints and defaults. TypeScript's text: the checkers read none of it; the compiled JavaScript drops it. Calls infer.

**Not in it.** Type arguments at a call: `a<b>(c)` is two comparisons, and any other reading must leave every such program alone. An earlier prototype did not: this rendered `true` upstream and threw on the branch. A component's, an action's or a server fn's type parameters.

<!-- frames branch=pass upstream=pass -->
```rx
fn test(a: number, b: number, c: number) => a<b>(c)
export default component App() { <p>{str(test(1, 2, 0))}</p> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `true` |

(This branch reads type arguments where a name between the brackets is no value of the module; the prototype neither needs nor changes that.)

## Prototype

**Built.** The text after the name, in both parsers; the projection; the printed signature and its reading; the tree-sitter grammar; `rx-lib`. Nothing in the emitters or the runtimes. No checker rule.

**Shown** (S-generic-1, a unit on both sides, all runners; tsrs and TypeScript 6).

- `T` survives a lifted call, `ref` arguments, record and tuple parts, `K extends keyof T`, constraints, defaults, `const`.
- For JavaScript, a fn that instantiates is `<T>(...args: __Refs<Parameters<typeof f<T>>, [true, false]>) => …`, and TypeScript **infers** `T` through it. It is written in `x.rx.d.ts`, where the types a constraint names are in scope: a type the module does not export is not in `x.d.ts`, and would be `any` there in silence.
- **A function-valued `T` at a `ref` boundary.** In `.rx` a parameter holds the function, and reading it does not call it. From TSX a function is the accessor: `createHeld(() => "x")` has `T` = `string`, and that is what runs; `createHeld((n: number) => "x")` and `createHeld<() => string>(() => "x")` are refused. The types and the run time agree.

**One thing the projection had to change.** `R-1` (no promise without `await`) is a type, and TypeScript could not decide it for an equation of a bare `T`: `fn f<T>(ref x: T): T { now = x … }` was refused (TS2345). The check now reads a tuple's length, which TypeScript takes for an undecided `T`; every verdict on a known type is the same, and the **caller's** equation is held:

<!-- check prototype=ok branch=PARSE upstream=PARSE -->
```rx
fn createHeld<T>(ref x: T): T { now = x
  now }
export default component App() { source a := 1
  h = createHeld(a)
  <p>{h}</p> }
```

**Cost.** Lines that are not tests: about 45 in the crate, 23 in `ref/`, 15 in `rx-lib`, 2 of grammar. A sentence in 07 §2 and one in TY-2. Checking time, compiled code: the same.

**Changes.** Over 2,228 modules and programs of this tree and of upstream's: only this file's first program.

**What it did not give:** no facade line goes away, and by itself it helps about 18 of the 192. Of the 192, **23** have type parameters and nothing else in the list that `.rx` lacks, and **12** more with [19](19-optional-parameters.md). Stubs with the published lists: the derived `.d.ts` takes every argument the original takes for 22 and for 11. But five (`signal-builders`' `filter`, `filterOut`, `map`, `remove`, `sort`) are generic over *the accessor* (`A extends MaybeAccessor<any[]>`): `.rx` can declare that and not read it. So about **18 and 11**.

In the twelve rewrites: of six results that were `any` for a TSX caller (`createSorted`, `createSortedIndex`, `createSortedProjection`, `createPresence`, `createPolled`, `createSegment`) **none is now**. No facade line goes away. With 19, of 16 derived signatures 11 are assignable to the original's, from 9, and some of the 9 were only because they were `any`.

**Questions.**

1. A generic **type alias** is `PARSE` in `.rx`. Three of the six rewrites wanted one (`Comparator<T>`, `State<T>`, `Poll<T>`) and wrote the type out each time.

<!-- check branch=PARSE upstream=PARSE -->
```rx
type Pair<T> = { a: T; b: T }
fn first(p: Pair<number>): number => p.a
export default component App() { <p>{first({ a: 1, b: 2 })}</p> }
```

2. `source kept := peek x` with a bare `T` needs `source kept: T`: without it a later write is TS2345. Loud, and has a way out.
3. In a generic body, an equation of `Promise<T> | T` is not refused (R-1), where `Promise<T>` is.
4. A source holding a function is wrong in compiled code, on `main` too, whatever its type (Solid's `createSignal(f)` is a derived signal). A `T` makes it easy to write without seeing it. Fixed on this branch since ([bug 25](bugs/25-source-that-holds-a-function.md)); the prototype does not have the fix:

<!-- frames prototype=fail branch=pass upstream=fail -->
```rx
export default component App() {
  source f := () => "one"
  <p>{f()}</p>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `one` |

**Verdict: worth proposing**, after 17 and with question 1. It removes every `any` it was meant to, and it is all types. Question 4 was a bug of its own.
