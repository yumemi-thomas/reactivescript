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
// a primitive whose instance has methods: nothing says what one answers stays the same
export pure fn createClock(): any instantiates
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
whole is exempt.

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

```rx
-- reject: SNAPSHOT_KEPT
import { createClock } from "./prims.js"
export default component App() {
  clock = createClock()
  shown = peek clock.now()
  <p>{shown}</p>
}
```

What a method of the instance answers may change — nothing in a declaration
says otherwise — so a kept `peek` of it keeps the first answer (E-5a,
aligned with E-10).

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  label = createLabel(clock.now())
  <p>{label}</p>
}
```

```rx
-- reject: SNAPSHOT_KEPT
import { createClock } from "./prims.js"
export default component App() {
  clock = createClock()
  c = clock
  shown = peek c.now()
  <p>{shown}</p>
}
```

An alias of the instance is the instance, and a method called on it is
the same call.

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  label = createLabel(clock["now"]())
  <p>{label}</p>
}
```

```rx
-- accept: whole-program
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  label = createLabel(peek clock["format"]())
  c = clock
  other = createLabel(peek c.format())
  <p>{label} {other}</p>
}
```

Where the answer is meant to be read once — a method that makes a value
from what it is given (`route.addChildren(…)`, S-module-22) — the argument
says so with `peek`, as for any value read once (E-10). A declaration had
a word for it, `methods(format)`; `peek` at the call says the same where
it matters, and is the language's own.

An instance never changes, so naming it and passing it whole read nothing
that does. Anything else read
*through a value that may be the instance* is a read of what may change
(ruled 2026-11-22). Which values may be it is one syntactic rule, with no
value followed (MO-10k): an expression that mentions the instance's name,
or a name bound to such an expression, unless what is written there makes
a primitive. So a method's answer is unstable however the
instance is reached: a record's field,

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  box = { c: clock }
  label = createLabel(box.c.now())
  <p>{label}</p>
}
```

an array's element,

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  label = createLabel([clock][0].now())
  <p>{label}</p>
}
```

a branch,

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  k = true
  label = createLabel((k ? clock : clock).now())
  <p>{label}</p>
}
```

or what a closure returns —

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  get = () => clock
  label = createLabel(get().now())
  <p>{label}</p>
}
```

and a kept `peek` of it keeps the first answer, the same ways:

```rx
-- reject: SNAPSHOT_KEPT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  box = { c: clock }
  label = peek box.c.now()
  <p>{label}</p>
}
```

```rx
-- reject: SNAPSHOT_KEPT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  label = peek (() => clock)().now()
  <p>{label}</p>
}
```

A call given the instance may hand it back, whatever is called and
however — an .rx fn twice over, a closure in a record, a closure a fn
made, a method of an array, a JS fn:

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
fn keep(x) { x }
export default component App() {
  clock = createClock()
  label = createLabel(keep(keep(clock)).now())
  <p>{label}</p>
}
```

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  o = { f: (x) => x }
  label = createLabel(o.f(clock).now())
  <p>{label}</p>
}
```

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
fn mk(x) { () => x }
export default component App() {
  clock = createClock()
  label = createLabel(mk(clock)().now())
  <p>{label}</p>
}
```

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  label = createLabel([].concat([clock])[0].now())
  <p>{label}</p>
}
```

A closure reads when it is called. One the argument calls by its name is
read there — a method its body calls, or a source it reads (E-10's
own rule, which a closure hid before):

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  f = () => clock.now()
  label = createLabel(f())
  <p>{label}</p>
}
```

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createLabel } from "./prims.js"
export default component App() {
  source n := 1
  f = () => n
  label = createLabel(f())
  <p>{label}</p>
  <button onClick={() => { n := n + 1 }}>+</button>
}
```

A closure held in a record is a function the checker does not see into:
given the instance, it may read through it.

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  o = { read: (c) => c.now() }
  label = createLabel(o.read(clock))
  <p>{label}</p>
}
```

One written among a call's arguments is handed the others: `c` may be
the clock.

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  label = createLabel(map([clock], (c) => c.now())[0])
  <p>{label}</p>
}
```

The same reads under a kept `peek` keep the first answer:

```rx
-- reject: SNAPSHOT_KEPT
import { createClock, createLabel } from "./prims.js"
fn mk(x) { () => x }
export default component App() {
  clock = createClock()
  label = peek mk(clock)().now()
  <p>{label}</p>
}
```

```rx
-- reject: SNAPSHOT_KEPT
import { createLabel } from "./prims.js"
export default component App() {
  source n := 1
  f = () => n
  shown = peek f()
  <p>{shown}</p>
  <button onClick={() => { n := n + 1 }}>+</button>
}
```

Named, the instance is passed whole and kept in records and arrays; a
method's answer read once is a `peek` in the argument:

```rx
-- accept
import { createClock, createLabel } from "./prims.js"
export default component App() {
  clock = createClock()
  c = clock
  a = createLabel(peek clock.format())
  b = createLabel(peek c.format().length)
  held = { clock: clock, clocks: [clock, c] }
  <p>{a} {b} {len(held.clocks)}</p>
}
```

A record or an array may hold it; what is read back out of one in an
argument is a read through what may be the instance, as above.
