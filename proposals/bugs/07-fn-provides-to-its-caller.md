# What a fn provides leaks into its caller

`provide` in a fn's block is for what that call makes. Compiled, it is set on the caller's region.

<!-- frames branch=pass upstream=fail -->
```rx
context d: string = "none"
fn inner() { provide d = "inner"
  1 }
component Child() {
  result = inner()
  v = use d
  <p>{result} {v}</p>
}
export default component App() { provide d = "outer"
  <Child /> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `1 outer` |

**On upstream (e650b85).** `expected '1 outer', got '1 inner'`. The interpreter is right.

**Spec.** RG-6a: a call makes a region nested in the caller's. RG-7b.

**Cause.** The emitted call has no region of its own for a fn that provides.

**Fix in this branch.** a134c50: a fn that provides is compiled with one.

**Test.** S-context-2, *what a fn provides is its call's*.
