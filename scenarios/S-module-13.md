# S-module-13 — the projection writes `ref` as JS has it: accessor arguments, results read as values

Rules: TY-4b, MO-10a, MO-10b, TY-6.

## Modules

```rx
-- module: ./prims.d.rx
export pure fn createToggle(initial: boolean): [ref boolean, (v: boolean) => void]
export pure fn createDebounced(ref source: string, ms: number): ref string
```

A `ref` parameter takes an accessor and a `ref` result is one, in JS (MO-10a,
MO-10b); `.rx` passes and reads plain values. The TSX projection writes the
JS side: a `ref` argument as `() => (e)`, a `ref` result (or tuple or record
part) read with a call, and the declaration's `.d.ts` with accessor types. So
the projection type-checks against a library's own `.d.ts` as well as
against the one projected from its `.d.rx` (TY-6 compares the two), and a
value read from a `ref` result has its value's type.

## Program

```rx
import { createToggle, createDebounced } from "./prims.js"

component Search(props: { start: boolean, q: string }) {
  [isOn, setOn] = createToggle(peek props.start)
  query = createDebounced(props.q, 300)
  size = query.length
  label = isOn ? "on" : "off"
  action flip() { setOn(!isOn) }
  <button onClick={flip}>{label} {size}</button>
}

export default component App() {
  <Search start={true} q="milk" />
}
```

Accepted by the checker and by TypeScript: `query` is a `string`, `isOn` a
`boolean`.

## Rejected variants

```rx
-- types: TS2362
import { createDebounced } from "./prims.js"
component Search(props: { q: string }) {
  query = createDebounced(props.q, 300)
  twice = query * 2
  <p>{twice}</p>
}
export default component App() {
  <Search q="milk" />
}
```

`query` is read as the `string` it holds, so arithmetic on it is refused.
