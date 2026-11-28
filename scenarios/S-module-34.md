# S-module-34 — a component given by name to a prop that takes a view (`fallback={Empty}`)

Rules: MO-11t, MO-11c, MO-11k, MO-12, 13 TY-4b.

## Modules

```rx
-- module: ./rx-types/@demo/kit.d.rx
// as two libraries declare such a prop: a list's `fallback`, a client-only part's, a button's `icon`
export context kit
export component Rows(props: { each: string[]; fallback?: View; children: (item: string) => View }) provides(kit)
export component Later(props: { fallback?: View | undefined; children?: View })
export component Button(props: { icon?: string | View; as?: Component; label?: (n: number) => View; children?: View })
export component Menu.Item(props: { icon?: View; children?: View })
export pure fn useKit(): ref number uses(kit)
```

A library's component takes an element in a prop that is not `children`:
`<Show fallback={<p>none</p>}>` in Solid's own JSX, a list's `fallback`,
every kit's `icon`. `.rx` writes markup in a view, not in an expression,
so the element is a component of the app's that takes no props, given to
the prop by its name — as MO-11c gives a component to a prop typed
`Component`. The declaration says which props take a view: a prop typed
`View` (`View | undefined`, `string | View`), other than `children`.

The component is applied there, with no arguments: `fallback={Empty}` is
JSX's `fallback={<Empty />}`, the element made where the library reads
the prop. So it is checked as the library's children are (MO-11c): under
what the library's component provides, above what it catches.

## Program

```rx
import { Rows, Later, Button, Menu, useKit } from "@demo/kit"
component Empty() {
  n = useKit()
  <p>nothing yet ({n})</p>
}
component Dot() {
  <i>•</i>
}
component Link() {
  <a href="/help">help</a>
}
export default component App() {
  source names := ["Ada"]
  <Rows each={names} fallback={Empty}>{view (name) { <p>{name}</p> }}</Rows>
  <Later fallback={Dot}><b>measured</b></Later>
  <Button icon={Dot} as={Link}>more</Button>
  <Button icon="→">plain</Button>
  <Menu.Item icon={Dot}>open</Menu.Item>
}
```

Accepted. `Empty` reads the kit's context, which `<Rows>` provides to
what it renders.

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { Later, useKit } from "@demo/kit"
component Empty() {
  n = useKit()
  <p>nothing yet ({n})</p>
}
export default component App() {
  <Later fallback={Empty}><b>measured</b></Later>
}
```

The component is checked where it is applied: `<Later>` provides no kit.

```rx
-- reject: COMPONENT_AS_VALUE
import { Later } from "@demo/kit"
component Dot() {
  <i>•</i>
}
export default component App() {
  <Later title={Dot}><b>measured</b></Later>
}
```

Only a prop the declaration types `View` (or `Component`, MO-11c) takes a
component: an undeclared prop is a value's.

```rx
-- reject: COMPONENT_AS_VALUE
import { Button } from "@demo/kit"
component Dot() {
  <i>•</i>
}
export default component App() {
  <Button label={Dot}>more</Button>
}
```

A prop typed as a function giving a view is a render prop (MO-11k):
`{view label (n) { … }}`.

```rx
-- reject: COMPONENT_AS_VALUE
import { Later } from "@demo/kit"
component Dot() {
  <i>•</i>
}
export default component App() {
  <Later fallback={true ? Dot : "none"}><b>measured</b></Later>
}
```

By its name, as a tag names it: an expression that computes a component
is a component used as a value.

```rx
-- types: TS2322
import { Later } from "@demo/kit"
component Missing(props: { label: string }) {
  <p>{props.label}</p>
}
export default component App() {
  <Later fallback={Missing}><b>measured</b></Later>
}
```

It is applied with no arguments, so a prop it requires is missing:
TypeScript's to say, on the name (13 TY-4b: the projection writes
`fallback={<Missing />}`).

```rx
-- accept
import { Later } from "@demo/kit"
component Note(props: { label?: string }) {
  <p>{props.label ?? "none"}</p>
}
export default component App() {
  <Later fallback={Note}><b>measured</b></Later>
  <Later fallback="none"><b>measured</b></Later>
}
```

A component whose props are all optional is applied with none; and a
view prop still takes a value that is a view (a string).
