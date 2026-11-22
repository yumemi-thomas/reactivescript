# S-module-28 — a JS component's callback prop is what its declaration says, whatever its name

Rules: MO-10g, SC-4, W-2, 07 §4.

## Modules

```rx
-- module: ./kit.d.rx
// the same prop name, `onCompare`, in two declared forms
export component Marked(props: { onCompare: handler (v: number) => void })
export component Plain(props: { onCompare: (v: number) => void })
// an `on…` prop the declaration does not type as a function
export component Loose(props: { onPick: any })
// `ref` as a component prop: the component calls it when it likes
export component RefMarked(props: { ref: handler (el: any) => void })
export component RefPlain(props: { ref: (el: any) => void })
export component RefLoose(props: { label: string })
```

On an element, an `on…` attribute and `ref` are handlers (SC-4, 07 §4).
On a declared JS component, a prop the declaration types as a function is
what the declaration says: `handler` makes a closure there a handler,
imperative scope where it may write; a function type without it is pure, as any closure made in reactive scope
is (MO-10g), however the library calls it. The name does not override the declaration: a library may call
`onCompare` while it computes. A prop the declaration does not type as a
function (`onPick: any`) keeps the name's reading. `ref` is a handler on
an element only, where the DOM calls it once with the node; on a component
it is a prop as any other, a handler only when the declaration says so.

## Program

```rx
import { Marked, Plain, Loose, RefMarked } from "./kit.js"
export default component App() {
  source n := 0
  source el := null
  <Marked onCompare={v => { n := v }} />
  <Plain onCompare={v => n + v} />
  <Loose onPick={() => { n := n + 1 }} />
  <RefMarked ref={e => { el := e }} />
  <button onClick={() => { n := n + 1 }} ref={e => { el := e }}>{n}</button>
}
```

Accepted: the closure at `Marked`'s `handler` prop writes `n`; the closures
at `Plain`'s is pure; the untyped `on…` prop, the DOM
event, the element's `ref` and `RefMarked`'s `ref` (declared `handler`) are handlers. The runners that execute have
no such components to run.

## Rejected variants

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
import { Plain } from "./kit.js"
export default component App() {
  source n := 0
  <Plain onCompare={v => { n := v }} />
  <p>{n}</p>
}
```

A function type without `handler` says nothing of when it is called, so
the closure is pure, whatever the prop's name.

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
import { RefPlain } from "./kit.js"
export default component App() {
  source n := 0
  <RefPlain ref={e => { n := 1 }} />
  <p>{n}</p>
}
```

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
import { RefLoose } from "./kit.js"
export default component App() {
  source n := 0
  <RefLoose label="x" ref={e => { n := 1 }} />
  <p>{n}</p>
}
```

A `ref` the declaration does not name is pure too: nothing says when the
component calls it.
