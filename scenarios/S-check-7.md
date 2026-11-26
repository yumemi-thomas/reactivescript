# S-check-7 — a statement closure in a record or a list is an io value

Rules exercised: SC-3, SC-4, SC-4b, R-io-3, MO-10g.

A part that builds its element's attributes writes them as one record: `attrs = { onKeyDown: (e) => { … } }`. A closure
written in reactive scope is a pure function (SC-3), so this was refused, and an action stood in for each handler
(`action down(e) { … }`, `{ onKeyDown: down }`: the packages' NOTES, B3). Since 2026-11-26 a statement closure written
as a field of a record or an item of a list is what that action is: an io value, carried freely and called where an io
value may be. It ends only where a handler is taken — an element's `on…` or `ref`, by name or through a spread; a
component's handler prop; what a JavaScript declaration marks `handler`. Called while the view computes (directly, in
a closure given to `map`, by a fn that calls it) it is refused, as an action is; given where no handler goes, it is the
closure SC-3 refuses.

## Program

```rx
context ops: { bump: (e: any) => void } = { bump: (e) => { } }
component Btn(p: { onClick?: (e: any) => void; children: View }) { <button onClick={p.onClick}>{p.children}</button> }
component Reader() { o = use ops
  <i onClick={o.bump}>r</i> }
component Part(p: { children: (r: { attrs: { onClick: (e: any) => void } }) => View }) {
  source k := 0
  <div><p.children attrs={{ onClick: (e: any) => { k := k + 1 } }} />{k}</div>
}
export default component App() {
  source n := 0
  source m := 0
  attrs = { onClick: (e: any) => { n := n + 1 }, title: "t" }
  hs = [(e: any) => { m := m + 1 }, (e: any) => { m := m + 10 }]
  provide ops = { bump: (e: any) => { n := n + 100 } }
  <button {...attrs}>a</button>
  <Btn onClick={hs[1]}>b</Btn>
  <ul>{for h in hs { <li onClick={h}>h</li> }}</ul>
  <Reader />
  <Part>{view (r) { <button {...r.attrs}>p</button> }}</Part>
  <p>{n} {m}</p>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `abhhrp00 0` |
| 1 | handler `attrs.onClick(0)` | `abhhrp01 0` |
| 2 | handler `hs[1](0)` | `abhhrp01 10` |

## Rejected variants

Called while the view computes.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  attrs = { onClick: (e: any) => { n := n + 1 } }
  <b>{str(attrs.onClick(1))}</b>{n}
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  hs = [(e: any) => { n := n + 1 }]
  y = [1].map((k) => hs[0](k))
  <b>{len(y)}</b>{n}
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
fn fire(r: any) => r(1)
export default component App() {
  source n := 0
  attrs = { onClick: (e: any) => { n := n + 1 } }
  y = str(fire(attrs.onClick))
  <b>{y}</b>{n}
}
```

Given where no handler goes.

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  attrs = { onClick: (e: any) => { n := n + 1 } }
  <b title={attrs.onClick}>b</b>{n}
}
```

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  attrs = { title: (e: any) => { n := n + 1 } }
  <b {...attrs}>b</b>{n}
}
```

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
component Show2(p: { label: any }) { <i>{str(p.label == undefined)}</i> }
export default component App() {
  source n := 0
  attrs = { onClick: (e: any) => { n := n + 1 } }
  <Show2 label={attrs.onClick} />{n}
}
```

Exported: what imports the module may call it while it computes — a router reads `route.loader` (the benchmark's
`router-rx-routes`). An action is exported instead.

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
source asked := 0
export route = { loader: () => { asked := asked + 1 } }
export default component App() { <p>{asked}</p> }
```

What stays as it was: a statement closure that is no item or field, and an expression closure that calls io.

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  f = (e: any) => { n := n + 1 }
  <button onClick={f}>b</button>{n}
}
```

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
export default component App() {
  source n := 0
  action inc() { n := n + 1 }
  attrs = { onClick: (e: any) => inc() }
  <button {...attrs}>b</button>{n}
}
```
