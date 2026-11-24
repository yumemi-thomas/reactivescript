# What a fn provides leaks into its caller

`provide` in a fn's block is for what that call makes. Compiled, it is set on the caller's region.

<!-- frames branch=pass upstream=fail -->
```rx
context d: string = "none"
fn useOuter(): string { provide d = "in"
  source n := 0
  str(n) }
component Kid() {
  a = useOuter()
  b = use d
  <p>{a} {b}</p>
}
export default component App() {
  provide d = "out"
  <Kid />
}
```

| instant | action | frame |
| ------- | ------- | ------- |
| 0 | mount | `0 out` |

**On upstream (e650b85).** `expected '0 out', got '0 in'`. The interpreter is right.

**Spec.** RG-6a: a call makes a region nested in the caller's. RG-7b.

**Cause.** The emitted call has no region of its own for a fn that provides.

**Fix in this branch.** a134c50: a fn that provides is compiled with one.

**Test.** S-context-2, *what a fn provides is its call's*.
