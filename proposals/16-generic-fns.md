# 16 — Generic `.rx` fns (design)

## Problem

<!-- check branch=PARSE upstream=PARSE says-upstream="near '<T>(xs: T[]): T" -->
```rx
fn first<T>(xs: T[]): T => xs[0]
export default component App() { <p>{first([1])}</p> }
```

Without type parameters the fn has one type, and an untyped parameter is TypeScript's error:

<!-- types branch=TS7006 upstream=TS7006 -->
```rx
fn first(xs) => xs[0]
export default component App() { n: number = first(["a"])
  <p>{n}</p> }
```

`xs: any[]` is accepted, and then `n: number = first(["a"])` is too.

## What upstream's spec says

Nothing of type parameters on a fn. 07 §2: a type is TypeScript's text, and the checker reads none of it. An `export type T<…>`
is text already. So a type parameter would be text as well.

## Proposal

- `fn f<T, const K extends keyof T = …>(…): …`: after the name, TypeScript's text up to its closing `>`. Also on an exported fn.
- The checkers read none of it. The projection writes it on the function it makes. The compiled JavaScript drops it.
- The printed signature carries it (it is text in a row), and the `.d.ts` is generic as TypeScript emits it.
- A call may give type arguments where TypeScript cannot infer them, `first<string>(xs)`. Upstream reads `<` there as a
  comparison today:

<!-- check branch=ok upstream=UNBOUND -->
```rx
import pure { make } from "./lib.js"
export default component App() { <p>{make<string>("a")}</p> }
```

This branch has type arguments at a call: it is type arguments if what stands between `<` and `>` is a list TypeScript's type
grammar reads whole, and `(` follows.

## Evidence

`node proposals/survey.mjs`, from the published types, over the 192 primitives that are `.rx` with JavaScript beside:

| | of 192 |
| --- | --- |
| have type parameters | 58 |
| … and neither an optional nor a rest parameter, nor overloads | 23 |
| … with an optional or rest parameter, no overload (needs [14](14-optional-parameters.md) too) | 26 |

In the 12 rewrites, `createSorted` answers `Row[]`, with `type Row = any`, in the types `rx-lib` derives. The original's is generic.

In declarations of JavaScript ([03](03-rows-for-typed-apis.md)) the same text is taken: 85 of 242 rows kept by the benchmark
have it.

## Cost (expected)

Both parsers (the scan for a type's end is there, for 03 and for type arguments at a call); the projection; the signature's text;
tree-sitter. No rule of a checker. In TSX `<T>` needs a comma (`<T,>`), which the projection writes.

## What it does not do

- No generic component (`component List<T>(props: …)`). It is the next question, and it is where `.rx` apps would use it.
- No generic action or context.

## Alternatives

- *`any`.* It is what the rewrites did. Type mistakes then pass.
- *A type alias with parameters, and a fn typed by it.* A fn's declaration has no place for its whole type.
- *Infer type parameters from untyped ones.* TypeScript does not.

## Compatibility

`fn f<` is a parse error today. `a<b>(c)` in an expression is two comparisons today, and would be a call: in JavaScript it is never
useful, and no module of upstream's repository changes verdict for it (305 modules, both binaries).

## Open questions, for the prototype to answer

1. An instantiating fn: is `Accessor<T>` right for a `ref` part when `T` may be a function? (13 offers "a value" only where the
   type holds none. A bare `T` holds one, perhaps.)
2. Does TypeScript infer `T` through the projection's wrapper for a lifted call, and for `ref` arguments?
3. Is an action inside a generic fn typed in terms of `T` in the printed `.d.ts`?
4. `const T` and defaults: does the printed signature read back?
5. Which of the 23 can then be written with the types they have? Write three.

**Prototype: not yet.** (Type arguments at a call are in this branch: 07 §3, S-surface-7, 09f97e3, 4989e39.)
