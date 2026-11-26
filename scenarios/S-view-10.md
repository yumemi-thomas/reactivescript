# S-view-10 — a `ref` given to a component written in `.rx` is a handler; inside the component it is io

Rules exercised: SC-4b, SC-4, 07 §4, R-io-3, MO-8j.

A component written in `.rx` is given `ref` as it is given `on…`: a handler, whose closure is imperative scope and may
write a source. That is sound because of what the component may do with it. Inside the component a handler it is
given (`props.ref`, `props.onPick`, the same read off a rest or a copy of its props) is io, as an action is: it is given
on — to an element, which calls `ref` once as it is made and `on…` when its event happens, or to another component's
handler — or called from imperative scope. Called in reactive scope it would write while the view computes
(Solid's `REACTIVE_WRITE_IN_OWNED_SCOPE`), so that is refused, by name or carried in a record or an array. A prop
whose type, as written, answers a value is no handler (below).

Solid calls an element's `ref` in the pass that makes the element, so what it writes is in the frame that shows the
element. A server makes no element: the server's frame is the one before the `ref`s (`## Server frames`), and the
browser shows the mount's once it has taken the page over. Each `ref` here writes by a function of the value (W-6): what
one `ref` reads of a source another wrote in the same pass is not the same rendered and hydrated, and is refused (SC-4c,
S-server-8).

## Program

```rx
component Field(props: { label: string; ref?: (e: Element) => void; onPick?: (n: number) => void }) {
  { label, onPick, ...rest } = props
  <label>{label}<input {...rest} onInput={() => { if (onPick) { onPick(1) } }} /></label>
}
component Row(props: { ref?: (e: Element) => void }) {
  <i ref={props.ref}>r</i>
}
export default component App() {
  source made := 0
  source rows := 1
  <p>{made}</p>
  <Field label="a" ref={(e: Element) => { made := m => m + 1 }} onPick={(n: number) => { made := m => m + n }} />
  {for i in [1, 2, 3].slice(0, rows) { <Row ref={(e: Element) => { made := m => m + 10 }} /> }}
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `11ar` |
| 1 | handler `rows := 2` | `21arr` |
| 2 | handler `rows := 0` | `21a` |
| 3 | handler `rows := 1` | `31ar` |

## Server frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `0ar` |

## Rejected variants

```rx
-- reject: IO_IN_REACTIVE
component Row(props: { onPick: any }) { <i>{props.onPick(1)}</i> }
export default component App() {
  source n := 0
  <Row onPick={(v: number) => { n := v }} />
  <p>{n}</p>
}
```

Called while the view computes: the handler the component is given is io.

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
component Row(props: { ref?: (e: Element) => number }) { <i>{props.ref ? props.ref(undefined) : 0}</i> }
export default component App() {
  source n := 0
  <Row ref={(e: Element) => { n := 1; return 1 }} />
  <p>{n}</p>
}
```

A prop whose type, as written, answers a value is a function the component calls for what it answers: no handler,
whatever its name, so the component may call it in reactive scope and a closure given to it is pure (`onFormat: (n:
number) => string`).

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
component Row(props: { onPick: (n: number) => void }) { hs = [props.onPick]
  <i title={str(hs[0](2))}>r</i> }
export default component App() {
  source n := 0
  <Row onPick={(v: number) => { n := v }} />
  <p>{n}</p>
}
```

Carried in an array, it is the same handler.

```rx
-- reject: ACTION_CALLED_IN_OWNED_SCOPE
component Row(props: { onPick: (n: number) => void; label: string }) { { label, ...rest } = props
  done = [1, 2].map(rest.onPick)
  <i>{label}{done.length}</i> }
export default component App() {
  source n := 0
  <Row label="r" onPick={(v: number) => { n := v }} />
  <p>{n}</p>
}
```

Given by name to what calls it while the call runs (MO-8j), off the rest of the props.

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
import { Thing } from "./thing.js"
export default component App() {
  source n := 0
  <Thing ref={(e: Element) => { n := 1 }} />
  <p>{n}</p>
}
```

A JavaScript component with no declaration calls its props when it likes: `ref` is a handler there only when its
declaration says so (`ref: handler (e: Element) => void`, MO-10g, S-module-28).
