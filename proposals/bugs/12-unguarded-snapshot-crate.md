# `UNGUARDED_SNAPSHOT` on a handler whose component is applied inside its regions

The crate refuses a program that `ref/` accepts.

<!-- check branch=ok upstream=UNGUARDED_SNAPSHOT|ok -->
```rx
import pure { load } from "./api.js"
component Saved() {
  source v = await load("v")
  <b onClick={() => { log(v) }}>{v}</b>
}
export default component App() {
  errored fallback(e) { <p>failed</p> } { loading fallback { <p>loading</p> } { <Saved /> } }
}
```

**On upstream (e650b85).** The crate: `UNGUARDED_SNAPSHOT [R-8] <b> onClick reads v as a snapshot`. `ref/check.ts`: ok (it has no such check).

**Spec.** R-8: a region that holds the value covers the element inside it. The region around `<Saved />` holds `{v}` with its element.

**Cause.** The crate looks no further than the component's root.

**Fix in this branch.** 39691e6: the regions are those of the tree that renders the element, at every place the module applies the component. Only the crate has the check, before and after.

**Test.** The unit `a_region_around_the_application_covers` in `compiler/src/check.rs` (four accepted, four refused).
