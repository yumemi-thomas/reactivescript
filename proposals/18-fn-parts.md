# 18 — What a fn of a package hands JavaScript

Needs [17](17-packages.md).

An instantiating fn answers `.rx` one value. JavaScript is handed each part: an accessor for a part that changes, the function for an action, the value for what is made once.

```ts
createPager: (pages: number | Accessor<number>, first: number) =>
  { page: Accessor<number>; set: (n: number) => Promise<void>; first: number }
```

The printed signature says the parts, so an `.rx` caller is refused what it was not:

<!-- check branch=ACTION_CALLED_IN_OWNED_SCOPE upstream=PARSE -->
```rx
import { createPager } from "./pager.rx"
export default component App() {
  source n := 4
  p = createPager(n, 1)
  <p>{p.page} {p.set(2)}</p>
}
-- file: ./pager.d.rx
//@ signature pager.rx
export pure fn createPager(ref pages: number, first: number): { page: ref; set: io } instantiates
```

**Evidence.** The twelve rewrites: server tests 17 of 29 before, 29 after; facade lines 261 and 198 (the first measure, not re-run). A *facade* is the JavaScript a package keeps beside its `.rx` to give the API it had.

**Cost.** 328 + 69 lines, and 108 + 58 (df2e30a). A signature's text grows.

**Open.** A part whose shape is not known is one accessor. Is that right?

**Prototype.** MO-13i, MO-9b (proposed ids). S-module-44.
