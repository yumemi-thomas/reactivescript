# A view given to JavaScript that provides has no owner of its own

A bug of this branch's crate, not of `main` (MO-11k is this branch's).

```rx
import { V } from "./v.js"
context c: string = "o"
component R() { <u>{use c}</u> }
export default component App() {
  <V after={R}>{view (x) { provide c = x
    <R /> }}</V>
}
```

`V` is `p => [p.children("a"), p.children("b"), p.after]`. It shows `abb`: what the second view provides is seen beside it. `ref/`'s emitter gives the view an owner of its own (RG-7a), and shows `abo`.

**Fix, on `proto-children`.** The crate does the same. **Test.** S-view-4 (the two emitters' code is compared); run in Chromium, both of Solid's builds.
