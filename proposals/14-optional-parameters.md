# 14 — Optional and default parameters on an `.rx` fn (design)

## Problem

<!-- check branch=PARSE upstream=PARSE -->
```rx
fn add(a: number, b?: number): number => a + (b ?? 3)
export default component App() { source a := 1
  <p>{add(a)}</p> }
```

<!-- check branch=PARSE upstream=ASSIGNMENT -->
```rx
fn add(a: number, b = 3): number => a + b
export default component App() { <p>{add(1)}</p> }
```

Upstream's checkers do not count a fn call's arguments, so leaving one out is accepted; TypeScript refuses it.

<!-- check branch=ok upstream=ok -->
```rx
fn add(a: number, b: number | undefined): number => a + (b ?? 3)
export default component App() { source a := 1
  <p>{add(a)}</p> }
```

<!-- types branch=TS2554 upstream=TS2554 -->
```rx
fn add(a: number, b: number | undefined): number => a + (b ?? 3)
export default component App() { source a := 1
  <p>{add(a)}</p> }
```

## What upstream's spec says

- E-9 names two kinds of parameter, value and `ref`. It says nothing of an absent one.
- AC-1f (2026-11-14, taken by default): a call of a declared *action* passes its parameters; any other count is
  `ARGUMENT_COUNT`. Nothing of the kind for a fn.
- 02, at `pre`: Solid's `(prev = v) => …` is read as `pre x -> v`. A default is not ruled out, nor in.

## Proposal

- `b?: T`: a call may leave a trailing argument out. In the body `b` is `T | undefined`.
- `b: T = e`: the same, and `e` stands for an absent argument. `e` may name module names and earlier parameters.
- `ref b?: T`: an absent argument is an accessor of `undefined`. `ref b: T = e`: the equation `e`, in the call's region.
- In a lifted call the default is part of the equation. In an instantiation a value default is evaluated once, when the
  call is made, as a snapshot (E-10): a default that reads reactive state is `SNAPSHOT_ARGUMENT` unless `peek`ed.
- `ARGUMENT_COUNT` for a fn: fewer than the required, or more than all.

Refused: a required parameter after an optional one; `?` with a default; a default that calls io.

## Evidence

Read again from the published types of the versions the benchmark pins (`node proposals/survey.mjs`), for the 192 primitives of the
survey that are `.rx` with JavaScript beside:

| | of 192 |
| --- | --- |
| take an optional or rest parameter | 97 (85 optional, 13 rest) |
| … and have no type parameter and one signature | 63 |
| have type parameters | 58 |
| take "a value or an accessor" | 88 (answered by [13](13-packages-in-rx.md)) |
| have none of optional, rest, type parameter, overload | 67 |

So with 13, this proposal takes the facade away from at most 63, and with [16](16-generic-fns.md) from 26 more. (The
survey's own count was 106 optional, default or rest, 51 generic and 95 value-or-accessor, by a search over the source text. The
table above replaces it.) "At most": no facade was rewritten.

In the 12 rewrites, the facades of `media` (`createBreakpoints`), `keyboard` (`createKeyHold`) and `sortable` (`createSorted`) read an
absent options record (read by hand).

## Cost (expected)

Both parsers; arity in both checkers; the emitters' parameters; the projection (TypeScript has the same form); the
signature's text (`b?`), so both readers of it; tree-sitter. The snapshot rule for a default is the one thing to learn.

## What it does not do

No named arguments, no rest parameter (13 of 192 use one), no optional parameter on an action or a component.

## Alternatives

- *A record of options* (`fn f(a, o: { b?: number })`). Works today, and is what most libraries do for more than two.
- *`?` only, no default.* `b ?? 3` in the body says the rest. It is smaller, and answers 85 of the 97. Recommended first.

## Compatibility

`ARGUMENT_COUNT` on a fn would refuse a call upstream's checkers accept and `rx-tsc` refuses. No accepted program else.

## Open questions, for the prototype to answer

1. Is a default on a `ref` parameter an equation with an owner, and does it cost a node when the argument is given?
2. Does an absent value argument of an instantiation stay absent when the fn is called from JavaScript with `undefined`?
3. Does a lifted call with a default re-run as the same call written out does? (Run both, in both checkers' runners.)
4. Does a printed signature with `b?` read back to the same verdicts (MO-9b)?
5. Does it remove a facade in any of the twelve packages, and which lines?

**Prototype: not yet.**
