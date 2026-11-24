# 20 — Generic `.rx` fns, with inferred calls (design)

Not prototyped. Narrowed: type parameters at the declaration, and no explicit arguments at a call.

<!-- check branch=PARSE upstream=PARSE says-upstream="near '<T>(xs: T[]): T" -->
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

**Proposal.** `fn first<T>(xs: T[]): T`. TypeScript's text; the checkers read none of it; the compiled JavaScript drops it. Calls infer.

**Explicit type arguments at a call are not proposed.** `a<b>(c)` is two comparisons upstream, and any reading of it as a call must leave every such program alone. An earlier prototype did not: this rendered `true` upstream and threw on the branch.

<!-- frames branch=pass upstream=pass -->
```rx
fn test(a: number, b: number, c: number) => a<b>(c)
export default component App() { <p>{str(test(1, 2, 0))}</p> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `true` |

The prototype reads type arguments now only where a name between the brackets is no value of the module, so that the comparison would be `UNBOUND` (`f<string>(x)`). It is used by 10 benchmark programs, for library calls with nothing to infer from.

**Evidence.** 58 of 192 surveyed primitives have type parameters; 23 have neither an optional or rest parameter nor overloads. 26 more need [19](19-optional-parameters.md) too, rest parameters included.

**Gates for a prototype.** `T` survives the projection of a lifted call and of `ref` arguments; a printed signature reads back; `Accessor<T>` is right where `T` may be a function, at a `ref` boundary; three of the 23 are written with the types they have.
