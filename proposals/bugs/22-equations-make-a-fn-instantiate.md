# A fn that declares only an equation is refused where a lifted fn is accepted

Not fixed in this branch: a question first. See [proposal 15](../15-locals-in-pure-fns.md).

<!-- check branch=INSTANTIATION_NOT_BOUND upstream=INSTANTIATION_NOT_BOUND says-upstream="declares state" -->
```rx
fn area(w: number, h: number): number { half = w / 2
  half * h }
export default component App() { source a := 1
  <p>{area(a, 2)}</p> }
```

**On upstream (e650b85).** `INSTANTIATION_NOT_BOUND [E-9] area(…) declares state`. It declares no state.

**Spec.** E-9: a call is an instantiation if the fn has a `ref` parameter *or whose body declares a source, effect, or region*. An equation is none of these. RG-6 says *a node-declaring body (E-9)*, which an equation may be. The two sentences disagree, and the checkers follow the second.

**Cause.** Any declaration in the body makes the fn instantiate, in both checkers.

**Fix in this branch.** None.

**Test.** None. The message at least should say *declares an equation*.
