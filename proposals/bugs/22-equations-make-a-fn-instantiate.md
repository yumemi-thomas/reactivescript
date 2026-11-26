# A question: a fn that declares only an equation is refused where a lifted fn is accepted

Not fixed in this branch: a question first. See [proposal 21](../21-locals-in-fns.md).

<!-- check prototype=ok branch=INSTANTIATION_NOT_BOUND upstream=INSTANTIATION_NOT_BOUND says-branch="declares an equation, `half`" says-upstream="declares state" -->
```rx
fn area(w: number, h: number): number { half = w / 2
  half * h }
export default component App() { source a := 1
  <p>{area(a, 2)}</p> }
```

A body that declares only a type is refused with the same message:

<!-- check branch=INSTANTIATION_NOT_BOUND upstream=INSTANTIATION_NOT_BOUND -->
```rx
fn id(n: number) { type Unused = number
  n }
export default component App() { <p>{id(1)}</p> }
```

**On upstream (e650b85).** `INSTANTIATION_NOT_BOUND [E-9] area(…) declares state`. It declares no state.

**Spec.** E-9: a call is an instantiation if the fn has a `ref` parameter *or whose body declares a source, effect, or region*. An equation is none of these. RG-6 says *a node-declaring body (E-9)*, which an equation may be. The two sentences disagree, and the checkers follow the second.

**Cause.** Any declaration in the body makes the fn instantiate, in both checkers.

**Fix in this branch.** The message (2026-11-26): it names what makes the fn instantiate — its first `ref` parameter,
the first thing its body declares (`declares an equation, \`half\``, `declares a type, \`Unused\``), or the context it
reads. The verdict stays until locals in fns (E-9, proposal 21) are taken.

**Test.** S-check-5 (the message); the verdict, proposal 21.
