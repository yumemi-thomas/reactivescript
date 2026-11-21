# S-module-28 — a JS component's callback prop is what its declaration says, whatever its name

Rules: MO-10g, MO-10j, SC-4, W-2, 07 §4.

## Modules

```rx
-- module: ./kit.d.rx
// the same prop name, `onCompare`, in three declared forms
export component Marked(props: { onCompare: handler (v: number) => void })
export component Plain(props: { onCompare: (v: number) => void })
export component Tracked(props: { onCompare: tracked (v: number) => void })
// an `on…` prop the declaration does not type as a function
export component Loose(props: { onPick: any })
```

On an element, an `on…` attribute and `ref` are handlers (SC-4, 07 §4).
On a declared JS component, a prop the declaration types as a function is
what the declaration says: `handler` makes a closure there a handler,
imperative scope where it may write; a function type without it, plain or
`tracked`, is pure, as any closure made in reactive scope is (MO-10g,
MO-10j). The name does not override the declaration: a library may call
`onCompare` while it computes. A prop the declaration does not type as a
function (`onPick: any`) keeps the name's reading.

## Program

```rx
import { Marked, Plain, Tracked, Loose } from "./kit.js"
export default component App() {
  source n := 0
  source el := null
  <Marked onCompare={v => { n := v }} />
  <Plain onCompare={v => n + v} />
  <Tracked onCompare={v => n * v} />
  <Loose onPick={() => { n := n + 1 }} />
  <button onClick={() => { n := n + 1 }} ref={e => { el := e }}>{n}</button>
}
```

Accepted: the closure at `Marked`'s `handler` prop writes `n`; the closures
at `Plain`'s and `Tracked`'s are pure; the untyped `on…` prop, the DOM
event and the element's `ref` are handlers. The runners that execute have
no such components to run.

## Rejected variants

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
import { Tracked } from "./kit.js"
export default component App() {
  source n := 0
  <Tracked onCompare={v => { n := v }} />
  <p>{n}</p>
}
```

`tracked`: the library calls it inside a computation of its own; a write
there is refused, although the prop is named `on…`.

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
