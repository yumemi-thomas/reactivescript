# S-module-44 — the parts of what a fn answers, in the printed signature

Rules: MO-13i, MO-9b, RG-6, R-io-3.

A fn that instantiates may answer several things. The printed signature says what each is: read (`ref`, with the rows it is
read with), an action (`io`), a value made once (`value`), a record or a tuple of such. JavaScript is handed each part
(MO-13i; run for real by `bench/tasks/rx-package` and `compiler/test/lib.mjs`). To `.rx` the result is one value, as it was.

## Modules

```rx
-- module: ./pager.rx
import pure { quote } from "./api"
export fn createPager(ref pages: number, first: number) {
  source raw := first
  page = raw > pages ? pages : raw
  action set(n: number) { raw := n }
  edges = { start: page == 1, end: page == pages }
  { page: page, set: set, first: first, edges: edges, label: (n: number) => `${n}/${pages}` }
}
export fn createPages(ref pages: number): [number, (n: number) => Promise<void>, boolean] {
  pager = createPager(pages, 1)
  [pager.page, pager.set, pager.edges.end]
}
export fn createOdd(ref pages: number) {
  source raw := 1
  action set(n: number) { raw := n }
  pages > 2 ? { at: raw, set: set } : { at: raw, set: set }
}
export fn createQuote(ref page: number) {
  asked = await quote(page)
  source kept := 0
  action keep(n: number) { kept := n }
  { asked: asked, kept: kept, keep: keep }
}
```

`export pure fn createPager(ref pages: number, first: number): { page: ref; set: io; first: value; edges: { start: ref; end: ref }; label: value } instantiates`,
`createPages(ref pages: number): [ref, io, ref]`, and `createOdd(ref pages: number): { set: io; … }`: a record a condition
picks is one value, some of whose parts are actions. `createQuote(ref page: number): pending fails(Error) { asked: ref pending
fails(Error); kept: ref; keep: io }`: the rows before it are the whole's, what an `.rx` caller is held to.

## Program

```rx
import { createPager, createPages, createOdd } from "./pager.rx"
export default component App() {
  source pages := 3
  p = createPager(pages, 2)
  [at, go, last] = createPages(pages)
  o = createOdd(pages)
  action more() { pages := n => n + 1 }
  action act() { p.set(9); go(2); o.set(5) }
  <p onClick={act}>{p.page} {p.first} {p.edges.end ? "end" : "mid"} {p.label(p.page)} {at} {last ? "last" : "more"} {o.at}</p>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `2 2 mid 2/3 1 more 1` |
| 1 | handler `act()` | `3 2 end 3/3 2 more 5` |
| 2 | handler `more()` | `4 2 end 4/4 2 more 5` |

## Rejected variants

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
import { createPages } from "./pager.rx"
export default component App() {
  source pages := 3
  x = createPages(pages)
  <p>{x[1](2)}</p>
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
import { createOdd } from "./pager.rx"
export default component App() {
  source pages := 3
  x = createOdd(pages)
  <p>{x.set(2)}</p>
}
```

The whole waits, so a part of it read where nothing holds it is refused, whatever the part's own rows say:

```rx
-- reject: UNHANDLED_FAILURE
import { createQuote } from "./pager.rx"
export default component App() {
  source page := 3
  q = createQuote(page)
  <p>{q.kept}</p>
}
```
