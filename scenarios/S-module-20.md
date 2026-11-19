# S-module-20 — the shapes solid-primitives returns: read-only fields and tuples, a scheduled callback

Rules: MO-10b, MO-10g, MO-10a, MO-8.

## Modules

```rx
-- module: ./prims.d.rx
// as @solid-primitives (Solid 2.0) declares them: stores with read-only fields, `as const` tuples
export pure fn createWindowSize(): { readonly width: number; readonly height: number } instantiates
export pure fn createObserver(ref elements: Element[]): readonly [ref any[], (el: Element) => boolean]
// a scheduled callback: made once, called later from handlers; the closure it takes runs later (MO-10g)
export pure fn debounce(callback: (...args: any[]) => void, wait?: number): (...args: any[]) => void instantiates
// the same, drafted from a generic signature with its callback loosened to `any`: no longer a callback
export pure fn loose(callback: any, wait?: number): (...args: any[]) => void instantiates
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
  search = debounce((v) => { query := `${v}` }, 150)
  <p>{size.width}x{size.height} {len(entries)}</p>
  <input onInput={(e) => { search(e.target.value) }} />
  <p>{query}</p>
}
```

Accepted.

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
