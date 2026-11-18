# S-module-15 — an element handed to JS: `ref` writes it, a callback reads it

Rules: 07 §4 (`ref`), MO-10g, MO-10b, W-1, SC-3.

## Modules

```rx
-- module: ./virtualizer.d.rx
// a headless virtualizer (TanStack Virtual's createVirtualizer, ported to Solid 2.0): the scroll element comes from a callback
export pure fn createVirtualizer(ref options: { count: number; getScrollElement: () => any; estimateSize: (i: number) => number }): { items: ref any[]; totalSize: ref number; scrollToIndex: (i: number) => void }
```

A library that needs a DOM element asks for it through a callback
(`getScrollElement`). In `.rx` the element comes from `ref`, an attribute
Solid calls once with the element it made: like an event handler, its
closure is imperative scope, so it writes a source (`scroller := el`). The
callback the library calls later reads that source (MO-10g). The rows and
size come back as readers (MO-10b), `scrollToIndex` as an io function.

## Program

```rx
import { createVirtualizer } from "./virtualizer.js"

export default component App() {
  rows = ["a", "b", "c"]
  source scroller := null
  { items, totalSize, scrollToIndex } = createVirtualizer({ count: rows.length, getScrollElement: () => scroller, estimateSize: i => 30 })
  <button onClick={() => { scrollToIndex(2) }}>last</button>
  <div ref={el => { scroller := el }} style="height:60px;overflow:auto">
    <div style={`height:${totalSize}px`}>
      {for item in items { <p>{rows[item.index]}</p> }}
    </div>
  </div>
}
```

Accepted.

## Rejected variants

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
export default component App() {
  source scroller := null
  shown = [1].map(n => { scroller := n; n })
  <div ref={el => { scroller := el }}>{shown}</div>
}
```

Only the `ref` closure is imperative: a statement closure elsewhere in the
view is still a reactive scope's.

```rx
-- reject: IO_IN_REACTIVE
import { createVirtualizer } from "./virtualizer.js"
export default component App() {
  source scroller := null
  { items, scrollToIndex } = createVirtualizer({ count: 3, getScrollElement: () => scroller, estimateSize: i => 30 })
  jumped = scrollToIndex(2)
  <div ref={el => { scroller := el }}>{jumped}</div>
}
```

A function in a primitive's result is io (MO-10b): it is called from a
handler, not read.
