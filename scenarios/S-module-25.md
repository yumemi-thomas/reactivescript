# S-module-25 — a library's draft: a store setter that hands a callback the state to change

Rules: MO-10i, W-1, MO-10g, 07 §5.

## Modules

```rx
-- module: ./store.d.rx
// as Solid 2's createStore is declared: its setter takes a callback whose parameter is the store's draft
export pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]
export fn each(xs: string[], f: (x: { label: string }) => void): void
export fn later(f: handler () => void): void
```

A library may hand a callback a value to change in place: Solid 2's store
setter passes the store's draft, `setStore(s => { s.done += 1 })`. A
`.d.rx` says which callback parameters are such drafts, `(draft state: T)
=> …` (MO-10i): in a closure passed there, a path of that parameter is
written with `:=` (`d.done := d.done + 1`), and the compiled closure
assigns it (`d["done"] = …`); the write is the library's, inside its
setter, not a source's. Only a path is written: the draft itself is
replaced by returning the new value. Anywhere else — a parameter the
declaration does not mark, the closure's own locals, a captured value —
a path write is refused as any write of a non-source is (W-1), so a
`.rx` value is never changed behind its writes. TypeScript checks the
value written against the draft's field (TY-1c). A path write takes an
updater as a source's does (W-6, `d.done := v => v + 1`). The store's
type is written at the call, `createStore<Todos>(…)` (07 §3), where the
initial literal (`items: []`) would leave TypeScript nothing to infer;
and since the module imports `createStore` from a declared JS module,
`[todos, setTodos] = createStore(…)` is that import's call, not Solid's
habit (`JS_API` is for a name the module does not import).

The draft is the callback's only while the library's call of it runs: a
library may take it back when the callback returns (Solid's store setter
does). A closure made inside the callback may run later, so a draft it
captures — to write a path, or to read one — is refused (`DRAFT_ESCAPES`,
MO-10i, revised 2026-11-21). An updater's place is evaluated once:
`d.items[i] := v => v + 1` reads and writes the same element, the object
and the key computed once each, as `x[k] += 1` is.

## Program

```rx
import { createStore } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{
    done: number
    items: string[]
  }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { d.done := v => v + 1; d.items[len(d.items)] := "x" }) }}>add</button>
  <p>{todos.done} {len(todos.items)}</p>
}
```

Accepted.

## Rejected variants

```rx
-- reject: WRITE_TO_NON_SOURCE
import { each } from "./store.js"
export default component App() {
  <button onClick={() => { each(["a"], (x) => { x.label := "b" }) }}>go</button>
}
```

`each`'s callback parameter is not declared a draft: its fields are not
written from `.rx`.

```rx
-- reject: WRITE_TO_NON_SOURCE
import { createStore } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { d := { done: 0, items: [] } }) }}>reset</button>
  <p>{todos.done}</p>
}
```

The draft itself is not reassigned: the callback returns the new value
(`setTodos((d) => ({ done: 0, items: [] }))`).

```rx
-- types: TS2345
import { createStore } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { d.done := "many" }) }}>add</button>
  <p>{todos.done}</p>
}
```

The value is checked against the draft's field: `done` is a number.

```rx
-- reject: JS_API
export default component App() {
  [n, setN] = createSignal(0)
  <p>{n}</p>
}
```

`createSignal` is not imported here: a hook's pair is Solid's habit, and
state is `source n := 0`.

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { later(() => { d.done := 1 }) }) }}>add</button>
  <p>{todos.done}</p>
}
```

The closure `later` calls may run after the setter has returned and the
library has taken its draft back: the write would land on nothing. Write
the path in the callback itself.

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { later(() => { log(d.done) }) }) }}>add</button>
  <p>{todos.done}</p>
}
```

A read through a captured draft is refused too: copy what the closure
needs into a local first (`let n = d.done`).

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { let alias = d; later(() => { log(alias.done) }) }) }}>add</button>
  <p>{todos.done}</p>
}
```

A local bound to the draft is the draft: the closure that captures it
captures the draft.

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
source saved: any := null
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { saved := d }) }}>add</button>
  <p>{todos.done}</p>
}
```

A source written with the draft keeps it past the call: it is refused as
a captured draft is, directly or through a local (`let a = d; saved :=
a`).

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
source saved: any := null
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { let a = d; saved := a }) }}>add</button>
  <p>{todos.done}</p>
}
```

In an array literal, the draft is kept as it is:

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { saved := [d] }) }}>add</button>
  <p>{todos.done}</p>
}
```

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { saved := { d } }) }}>add</button>
  <p>{todos.done}</p>
}
```

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { saved := { x: d } }) }}>add</button>
  <p>{todos.done}</p>
}
```

and read back out of one by a static index, it is the draft again.

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { saved := [d][0] }) }}>add</button>
  <p>{todos.done}</p>
}
```

Destructuring takes the draft out of the literal it was put in.

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { let [a] = [d]; later(() => { log(a.done) }) }) }}>add</button>
  <p>{todos.done}</p>
}
```

A branch of `?:`, `??`, `||` or `&&` may be the draft:

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { saved := true ? d : null }) }}>add</button>
  <p>{todos.done}</p>
}
```

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { saved := d ?? null }) }}>add</button>
  <p>{todos.done}</p>
}
```

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { let a = true ? d : d; later(() => { log(a.done) }) }) }}>add</button>
  <p>{todos.done}</p>
}
```

and so may what an .rx fn or a closure returns, given it:

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { saved := keep(d) }) }}>add</button>
  <p>{todos.done}</p>
}
```

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { saved := (() => d)() }) }}>add</button>
  <p>{todos.done}</p>
}
```

A closure that captures a local holding the draft whole captures the draft.

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { let a = { x: d }; later(() => { log(a.x.done) }) }) }}>add</button>
  <p>{todos.done}</p>
}
```

Which values may be the draft is one analysis, shared with `renders`
values (MO-11l), held fields (MO-10f) and instances' methods (E-10): through
an alias, a record or array literal (a static key or index precisely, a
dynamic one as any key), destructuring, `?:`, `??`, `||`, `&&`, what an .rx
fn or a closure returns, and what a closure captures (revised 2026-11-21
after review).

```rx
-- accept
import { createStore, later } from "./store.js"
source saved: any := null
fn keep(x) { x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { let xs = [d.done, 1]; saved := xs[1]; let b = [1, d]; saved := b[0] }) }}>add</button>
  <p>{todos.done}</p>
}
```

`xs[1]` and `b[0]` are the literal `1`, not the draft: a static index is
read precisely. A field read through the draft (`d.done`) is a copy.

```rx
-- accept: whole-program
import { createStore, later } from "./store.js"
source saved: number := 0
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { let n = d.done; let a = d; a.done := n + 1; saved := d.done; later(() => { log(n) }) }) }}>add</button>
  <p>{todos.done} {saved}</p>
}
```

A scalar copied out of the draft is a value of the callback's own: the
closure may keep it, and a source may take it. A path of a local bound to
the draft is written as the draft's own.
