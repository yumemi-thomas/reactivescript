# A fn that reads a context is refused, or reads the wrong provision

No `useForm()` can be written. The same two lines in the component are accepted.

<!-- check branch=ok upstream=CONTEXT_NOT_FOUND -->
```rx
context form: { id: string }
fn useForm() { f = use form
  f }
component Field() {
  f = useForm()
  <label>{f.id}</label>
}
export default component App() {
  provide form = { id: "a" }
  <Field />
}
```

With a default the fn is accepted, and then reads the default under a provision:

<!-- frames branch=pass upstream=fail -->
```rx
context density: number = 1
fn useDensity() { (use density) * 10 }
component Kid() { d = useDensity()
  <p>{d}</p> }
export default component App() {
  provide density = 2
  <Kid />
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `20` |

**On upstream (e650b85).** `CONTEXT_NOT_FOUND` at the fn's own line, whatever its callers provide. The second program: `expected '20', got '10'`.

**Spec.** RG-6a: the call of an instantiating fn makes a region in the caller's. RG-7b: `use` reads the nearest provision above. The caller's region is above.

**Cause.** The checkers resolve `use` in a fn as if the fn stood at the module's root. A fn whose body is one expression is lifted, and `use` is compiled in the lifted equation.

**Fix in this branch.** 179c71c: a fn's `use` is checked above each call, through other fns and modules (a printed signature says `uses(…)`). A fn never called is checked nowhere. A fn that reads a context instantiates, so its call is bound: `<p>{useDensity()}</p>`, accepted upstream, is `INSTANTIATION_NOT_BOUND`.

**Test.** S-context-2.
