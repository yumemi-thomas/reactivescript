# S-module-14 — render props: `view (…) { … }` as a JS component's children

Rules: MO-11k, MO-11a, RG-4c, R-f-5, RG-7b, SV-7d.

## Modules

```rx
-- module: ./virtual.d.rx
// a list that renders only the rows in view, calling its children for each one
export component VirtualList(props: { items: any[]; height?: number; children: (item: any, index: number) => View; header?: (count: number) => View })
export component Panel(props: { title: string; children?: View })
// a list that renders its items by itself unless it is given a view for them
export component Listbox(props: { children?: (items: any) => View })
```

```rx
-- module: ./theme.rx
export context theme: string
```

A JS component whose declaration types `children` as a function giving a
`View` takes a render prop. In `.rx` it is written as the component's only
child, a view lambda: `{view (row, i) { … }}`. Its parameters are the values
the component passes on each call; its body is a block (declarations, then
a view) checked as the application's children are (RG-4c): its readers'
failures and the contexts it uses are checked above the application, through
the component's declaration (MO-11b), and its content is checked where the
component places its children (SV-7d). It lowers to an arrow returning the
view, `children: (row, i) => …`, and projects to the same arrow, so TypeScript
types `row` and `i` from the component's own types.

## Program

```rx
import pure { fetch } from "./prelude"
import { VirtualList } from "./virtual.js"
import { theme } from "./theme.rx"

export default component App() {
  source picked := -1
  provide theme = "dark"
  errored fallback(e) { <p>failed</p> } {
    loading fallback { <p>loading…</p> } {
      <VirtualList items={["a", "b", "c"]} height={300}>
        {view header (n) { <p>{n} rows, {use theme}</p> }}
        {view (row, i) {
          detail = await fetch(`detail:${row}`)
          mark = i == picked ? "✓" : ""
          <button class={use theme} onClick={() => { picked := i }}>{row} {detail} {mark}</button>
        }}
      </VirtualList>
    }
  }
}
```

Accepted (a named render prop, `{view header (n) { … }}`, is the prop of
that name, and is checked as the children are): the row's `fetch` can fail, and the `errored` above
`<VirtualList>` discharges it; `use theme` finds the provision above it; the
handler writes `picked` with the row's index.

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetch } from "./prelude"
import { VirtualList } from "./virtual.js"
export default component App() {
  <VirtualList items={["a"]}>
    {view (row) {
      detail = await fetch(`detail:${row}`)
      <p>{detail}</p>
    }}
  </VirtualList>
}
```

A failure in the render prop escapes through the component (which declares
no `catches`) to the application, where nothing discharges it.

```rx
-- reject: CONTEXT_NOT_FOUND
import { VirtualList } from "./virtual.js"
import { theme } from "./theme.rx"
export default component App() {
  <VirtualList items={["a"]}>
    {view (row) { <p class={use theme}>{row}</p> }}
  </VirtualList>
}
```

The body uses `theme` and nothing above the application provides it.

```rx
-- reject: VIEW_FN_EXPECTED
import { VirtualList } from "./virtual.js"
export default component App() {
  <VirtualList items={["a"]}><p>static</p></VirtualList>
}
```

A component that takes a render prop is given one: its children are called,
not placed. One whose render prop is optional may be given none
(2026-11-22): it renders by itself.

```rx
-- accept
import { Listbox } from "./virtual.js"
export default component App() {
  <Listbox />
  <Listbox>{view (items) { <p>{len(items)}</p> }}</Listbox>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
import { Listbox } from "./virtual.js"
export default component App() {
  <Listbox><p>static</p></Listbox>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
import { Panel } from "./virtual.js"
export default component App() {
  <Panel title="x">{view (row) { <p>{row}</p> }}</Panel>
}
```

`Panel`'s children are a `View`, not a function of one; and a view lambda
anywhere else (`<ul>{view (x) { … }}</ul>`) is refused the same way.

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
import { VirtualList } from "./virtual.js"
export default component App() {
  source picked := -1
  <VirtualList items={["a"]}>
    {view (row, i) {
      shown = [row].map(r => { picked := i; r })
      <p>{shown}</p>
    }}
  </VirtualList>
}
```

The body is reactive scope like any view's: a statement closure there is
refused; writes belong in handlers.

```rx
-- reject: VIEW_FN_MISPLACED
import { VirtualList } from "./virtual.js"
export default component App() {
  <VirtualList items={["a"]}>
    {view footer (n) { <p>{n}</p> }}
    {view (row) { <p>{row}</p> }}
  </VirtualList>
}
```

A named view lambda names a render prop the declaration has: `footer` is
not one.

