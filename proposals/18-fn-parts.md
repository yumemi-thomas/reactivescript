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

## The same for a JavaScript fn's declared result: `io` on a function part (2026-11-26, `rx-packages`)

A declared row (`.d.rx` for a JavaScript module) said `ref` of a part and nothing of a function part: bound by a name a function was io, read as a field it was io only where its type answers nothing or a promise. So a fn that makes a thing with a function that answers a value *and does something* could only be declared by taking `pure` off the whole row (and the fn was then refused in a component's body), and `{ read } = make(); read()` was refused where `c.read()` was not. **Decided: one word, `io`, before a function part's type; a part is read the same by a name and as a field.**

<!-- check branch=IO_IN_REACTIVE upstream=PARSE -->
```rx
import { makeClipboard } from "./clip.js"
export default component App() {
  c = makeClipboard()
  { read } = makeClipboard()
  <p>{c.read()} {read()} {str(c.write("x"))}</p>
}
-- file: ./clip.d.rx
export pure fn makeClipboard(): { read: () => string; write: io (text: string) => boolean; clear: () => void }
```

The fn stays `pure`: calling it only computes. `read` is a read by either name. `write` is refused in the view and called from a handler. A part that answers nothing or a promise is io without the word, as it was, now by a name too and for a fn that is no instantiation.

`rx-declare` writes the word where the code shows the function is not one that only computes and the row writes that part a function type, and keeps `pure` (it took `pure` off: 170 rows over about 4,000 packages on `rx-gen`); `rx-verify` reads a part so marked as no part of what `pure` claims.

**Evidence.** 425 generated programs (5 kinds of part × a field, a tuple's item, the whole result × a plain fn and an instantiation × 10 uses × by a name and as a field): both checkers agree on all, 245 accepted and 180 refused as wanted; the projection is alike and the accepted ones type-check. S-module-49. A small module through `rx-declare`: 2 rows of 4 keep `pure` that lost it, each function part marked.

**Not done.** The whole result written in parentheses (`(() => number)`) is not marked by `rx-declare` (the row stays io, as before). The count over the 4,000 packages was not run again here.
