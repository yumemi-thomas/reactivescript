# `pre` of a `ref` parameter is accepted and does not compile

The checkers accept; the compiler stops with no line.

<!-- check branch=ok upstream=ok -->
```rx
fn createPrevious(ref x: number): number { p = pre x -> 0
  p }
export default component App() {
  source n := 1
  before = createPrevious(n)
  <p>{before}</p>
}
```

<!-- frames branch=pass upstream=refused -->
```rx
fn createPrevious(ref x: number): number { p = pre x -> 0
  p }
export default component App() {
  source n := 1
  before = createPrevious(n)
  <p>{before}</p>
}
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `0` |
| 1 | handler `n := 5` | `1` |

**On upstream (e650b85).** `not compiled — pre x: no companion memo`. An import is the same.

**Spec.** C-2, E-9: a `ref` parameter denotes an equation inside the body.

**Cause.** The companion is made where the name is declared, and a parameter or an import is declared elsewhere.

**Fix in this branch.** f9ab9ba: the companion is made where `pre` is written. `pre props` is `PRE_OF_NON_REACTIVE` in both checkers.

**Test.** S-pre-1.
