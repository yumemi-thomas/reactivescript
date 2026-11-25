# What a region provides is seen beside it

A branch that takes another's place:

<!-- frames branch=pass upstream=fail -->
```rx
context c: string = "none"
component Seen() {
  <b>{use c}</b>
}
export default component App() {
  source lit := true
  <p>{if lit { provide c = "branch"
    <Seen /> } else { <Seen /> }}</p>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `branch` |
| 1 | handler `lit := false` | `none` |

A component beside it, in Solid's production build (the server's here):

<!-- frames runner=ssr branch=pass upstream=fail -->
```rx
context c: string = "none"
component Seen() {
  <b>{use c}</b>
}
component Prov() {
  provide c = "one"
  <Seen />
}
export default component App() {
  <p><Prov /><Seen /></p>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `onenone` |

**On upstream (e650b85).** `branch`, and `oneone`. Nothing warns, and the development build shows the second right.

**Spec.** RG-7a: a provision is for the region that declares it, and what is in it.

**Cause.** A provision is set on the current owner. In Solid 2's production build a component has none of its own, and the branches of an `if` share their condition's. Each time such a branch is made, its provision is also made under the last one, so every one is kept (a leak).

**Fix in this branch.** A region that provides has an owner of its own, as a fn that provides has (bug 07). In both emitters, on both sides, and in the oracle.

**Test.** S-context-3, *what a region provides is for what is in it*; `compiler/test/leaks.mjs`.
