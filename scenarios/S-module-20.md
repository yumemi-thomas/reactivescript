# S-module-20 — the shapes solid-primitives returns: read-only fields and tuples, a scheduled callback

Rules: MO-10b, MO-10g, MO-10a, MO-8, 07 §3.

## Modules

```rx
-- module: ./prims.d.rx
// as @solid-primitives (Solid 2.0) declares them: stores with read-only fields, `as const` tuples
export pure fn createWindowSize(): { readonly width: number; readonly height: number } instantiates
export pure fn createObserver(ref elements: Element[]): readonly [ref any[], (el: Element) => boolean]
// a scheduled callback: made once, called later from handlers; the closure it takes runs later (MO-10g)
export pure fn debounce(callback: handler (...args: any[]) => void, wait?: number): (...args: any[]) => void instantiates
// the same, drafted from a generic signature with its callback loosened to `any`: no longer a callback
export pure fn loose(callback: any, wait?: number): (...args: any[]) => void instantiates
// a primitive with a value parameter: its argument is read once (E-10)
export pure fn createLabel(width: number): any instantiates
```

TypeScript's `readonly` on a field and on a tuple is a modifier, not part
of the name or the shape: `size.width` reads the field `width`, and a
`readonly [ref any[], …]` result is a tuple whose first part is an
accessor (MO-10b). A closure passed where the declaration types a function
runs later, as a handler (MO-10g); passed where it types `any`, it is part
of the call's value, and pure.

## Program

```rx
import { createWindowSize, createObserver, debounce } from "./prims.js"
source query: string := ""
export default component App() {
  size = createWindowSize()
  [entries, isVisible] = createObserver([])
  search = debounce((v: string) => { query := v }, 150)
  <p>{size.width}x{size.height} {len(entries)}</p>
  <input onInput={(e) => { search(e.target.value) }} />
  <p>{query}</p>
}
```

Accepted. A closure's parameter may carry its TypeScript type (`v: string`, 07 §3): the
library types the debounced arguments as `unknown`, and the type says what the closure takes. It is TypeScript's
alone, checked in the projection and gone from the JavaScript.

## Rejected variants

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
import { loose } from "./prims.js"
source query: string := ""
export default component App() {
  search = loose((v) => { query := `${v}` }, 150)
  <input onInput={(e) => { search(e.target.value) }} />
}
```

Where the declaration types the parameter `any`, nothing says the library
calls it later: the closure is pure, and a write in it is refused. (So
`rx-declare` keeps a callback's function type even in a generic
signature.)

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createWindowSize, createLabel } from "./prims.js"
export default component App() {
  size = createWindowSize()
  w = size.width
  label = createLabel(w)
  <p>{label}</p>
}
```

The instance `createWindowSize` made never changes, but its fields track
(MO-10b): `w` follows `size.width`, so passing it to a value parameter
reads it once and keeps the first width (E-10). Only the instance passed
whole is exempt, and a method its declaration names on the result
(`route.addChildren(…)`, S-module-22), which reads no field.

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createWindowSize, createLabel } from "./prims.js"
export default component App() {
  size = createWindowSize()
  label = createLabel(size.width)
  <p>{label}</p>
}
```

The same, with the field read in the argument itself.

```rx
-- types: TS2345
import { debounce } from "./prims.js"
source query: string := ""
export default component App() {
  search = debounce((v: number) => { query := v }, 150)
  <input onInput={(e) => { search(e.target.value) }} />
}
```

The parameter's type is checked as TypeScript checks it: a `number` is not written into a `string` source (a write is
the source's setter called with the value, so TypeScript reports the argument).
