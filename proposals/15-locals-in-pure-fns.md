# 15 — A name for a value inside a pure fn (design)

## Problem

A fn that names an intermediate value is refused where the same expression in one line is accepted.

<!-- check branch=INSTANTIATION_NOT_BOUND upstream=INSTANTIATION_NOT_BOUND -->
```rx
fn area(w: number, h: number): number { half = w / 2
  half * h }
export default component App() { source a := 1
  <p>{area(a, 2)}</p> }
```

The way round that is accepted today:

<!-- check branch=ok upstream=ok -->
```rx
fn area(w, h) => ((half) => half * h)(w / 2)
export default component App() { source a := 1
  <p>{area(a, 2)}</p> }
```

## What upstream's spec says

It says two things.

- E-9: a call is an instantiation if the fn has a `ref` parameter, *or whose body declares a source, effect, or region*.
  An equation is none of these. By this text `area` is lifted, and the program above is correct.
- 03, RG-6: *a call to a function with a `ref` parameter or a node-declaring body (E-9)*. An equation may be a node.
- Both checkers follow the second, for any declaration, with the message *declares state*
  ([bug 22](bugs/22-equations-make-a-fn-instantiate.md)).

## Proposal

Read E-9 as written. No new syntax.

- A fn with no `ref` parameter, whose body declares only equations (`x = e`, destructuring included) with no `await`, no
  `pre`, no `use`, no `key`, and no call of an instantiating fn, does not instantiate. Its call is lifted (E-2).
- Its equations are names for values of that one evaluation. They are compiled as `const`, with no node.
- Anything else in the body instantiates, as today.

A fn can then stop instantiating when its last source goes. Its callers may be less strict then, never more: a bound call
stays correct.

## Evidence

Weak for libraries, and stated so.

- The survey's 739 primitives were not counted for this. It gives it as a cause of "most of the 418 lines of JavaScript"
  of the 12 rewrites. Read again by hand (the packages' `src/*.js`, 172 lines without comments and blanks, at 5b8e268): 11
  pure functions name a local (`target`, `step`; `pressed`, `released`; `window`, `segment`; `next`; `ascending`,
  `descending`, `sortedIndex`, `insertSorted`). Only 3 need nothing else that `.rx` lacks (`target`, `insertSorted`, and
  `next` with its early returns written as conditions). The others use `Math`, `Array.from`, `typeof`, a loop, or a
  mutation. **So this unlocks no primitive of the 739 by itself.**
- The evidence that is left is the two sentences that disagree, and the message.

## Cost (expected)

One predicate in both checkers (which bodies make nothing), used by the signature; `const` in the two emitters; the
projection already writes `const`. Nothing new to write. Harder to learn: why one body instantiates and another does not. It is
E-9's question today.

## What it does not do

No `let`, no reassignment, no loop, no early return.

## Alternatives

- *`let x = e` in a fn's body*, an imperative word. A parse error today in reactive scope, with good reason: `let` promises
  reassignment.
- *A statement body for closures of reactive scope.* W-2 refuses it, so that a closure there is pure by its shape.
- *`const x = e`.* A third binding word, beside `=` and `let`.
- *Change E-9's text to "declares anything".* It is the smallest change, and makes spec and checkers agree. Then fix the
  message.

## Compatibility

Programs refused become accepted. A call of such a fn bound by a name (`x = area(a, 2)`) changes from an instantiation to a
lifted call: its arguments are no longer snapshots, so `SNAPSHOT_ARGUMENT` is not asked, and it follows its arguments.
For a call accepted today with `peek` or constants, the value is the same.

## Open questions, for the prototype to answer

1. Which sentence did upstream mean? Ask first: the prototype is needed for one answer only.
2. Is an equation that names the language's `pre`, or a keyed one, the whole list of what still makes a node?
3. Exported fns: a signature that loses `instantiates` is a looser one. Does any importer get a wrong program from it?
4. How many fns in upstream's `examples/`, `scenarios/` and `eval/` change kind, and does any frame?
5. Does the crate lift it through the emitter's inline path with no node (compare the compiled code)?

**Prototype: not yet.**
