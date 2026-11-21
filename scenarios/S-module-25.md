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
does). So a draft is a *place*, not a value (MO-10i, ruled 2026-11-22):

- Its name stands in the callback it is the parameter of, and nowhere
  else: a closure made inside the callback may run later, so it may not
  name the draft, to write a path or to read one (`DRAFT_ESCAPES`). The
  one exception is a path's updater, `d.n := v => v + d.step`, which is
  applied where it is written. An `await` ends the library's call, so the
  callback has none. A loop is a statement, `for (const x of xs) { … }`
  (07 §5), not a closure; a turn of a loop over a path of the draft is a
  place of the draft (`for (const t of d.items) { t.done := true }`).
- A read of it is a copy: `let n = d.done`, `saved := d`, `keep(d.sub)`,
  `[d]` hold what the draft held then, never the library's own object
  (`__rt.copy`: arrays, plain objects, Maps and Sets copied through). What
  goes straight back to the library is not copied: a value written to a
  path of the draft, the callback's result, an argument of the draft's own
  method (`d.items.push(d.last)`).
- The function that hands the draft is called by its own name, with the
  callback written in the call: it is not passed, stored, or given
  another name, so the parameter of every callback it is given is known to
  be a draft. A change is shared as an action that calls it.

An updater's place is evaluated once: `d.items[i] := v => v + 1` reads and
writes the same element, the object and the key computed once each, as
`x[k] += 1` is.

## Program

```rx
import { createStore } from "./store.js"
source saved: any := null
export default component App() {
  [todos, setTodos] = createStore<{
    done: number
    items: string[]
  }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => {
    d.done := v => v + 1
    d.items[len(d.items)] := "x"
    for (const x of [1, 2]) { d.done := d.done + x }
    for (const t of d.items) { saved := t }
    let first = d.items[0]
    saved := [d.items, first]
    d.items.push(d.items[0])
  }) }}>add</button>
  <p>{todos.done} {len(todos.items)}</p>
}
```

Accepted. The compiled callback writes the paths as assignments, loops
with `for … of`, and copies what it reads out of the draft: `let v$first
= __rt.copy(v$d?.items?.[0])`, `w$saved.set([__rt.copy(v$d?.items),
v$first])`; the argument of the draft's own `push` is not copied.

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

A read through a captured draft is refused too: read what the closure
needs into a local first (`let n = d.done`, a copy).

Any closure, wherever it is given: the checker does not know that a
method calls it now and forgets it, so a loop over a draft is the
statement (below), not `forEach`.

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { [1, 2].forEach((x) => { d.done := d.done + x }) }) }}>add</button>
  <p>{todos.done}</p>
}
```

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { d.items := map(d.items, (x) => x + d.done) }) }}>add</button>
  <p>{todos.done}</p>
}
```

An `await` in the callback ends the library's call before the callback
does:

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
import pure { fetch } from "./prelude"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { let n = await fetch("n"); d.done := n }) }}>add</button>
  <p>{todos.done}</p>
}
```

The callback is written at the call, or it is a closure given a name and
used for nothing else (2026-11-22): a closure bound by an equation or a
local, whose name is written only as the argument of a function that
hands that position a draft, is that function's callback — its parameter
is the draft, its body the callback's (it writes paths; what it reads out
is a copy; it has no `await`). So one change is written once and shared
by the handlers that make it:

```rx
-- accept
import { createStore } from "./store.js"
source saved: any := null
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  bump = (d) => { d.done := d.done + 1; saved := d.items }
  <button onClick={() => { setTodos(bump) }}>one</button>
  <button onClick={() => { let twice = (d) => { d.done := d.done + 2 }; setTodos(twice); setTodos(bump) }}>three</button>
  <p>{todos.done}</p>
}
```

Any other use of the name is refused where it is written: called by hand
it would be given something that is no draft, and passed on or stored it
could be called with a draft the checker does not see.

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  bump = (d) => { d.done := d.done + 1 }
  <button onClick={() => { setTodos(bump); bump(todos) }}>one</button>
  <p>{todos.done}</p>
}
```

```rx
-- reject: DRAFT_ESCAPES
import { createStore, later } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { let up = (d) => { d.done := 1 }; setTodos(up); later(up) }}>add</button>
  <p>{todos.done}</p>
}
```

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
source saved: any := null
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { let up = (d) => { d.done := 1 }; setTodos(up); saved := [up] }}>add</button>
  <p>{todos.done}</p>
}
```

A function that is not such a closure — a parameter, a prop, what a call
answers — is still handed the draft where the checker does not know its
parameter is one:

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
component Row(props: { onChange: (d: any) => void }) {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos(props.onChange) }}>add</button>
}
export default component App() {
  <Row onChange={(d) => {}} />
}
```

and so the setter itself does not travel — another name,

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
source saved: any := null
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { let set2 = setTodos; set2((d) => { saved := d }) }}>add</button>
  <p>{todos.done}</p>
}
```

a component's prop,

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
component Row(props: { set: any }) {
  <button onClick={() => { props.set((d) => d) }}>add</button>
}
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <Row set={setTodos} />
  <p>{todos.done}</p>
}
```

or inside the result it came in, held whole:

```rx
-- reject: DRAFT_ESCAPES
import { createStore } from "./store.js"
component Row(props: { st: any }) {
  <p>{props.st[0].done}</p>
}
export default component App() {
  st = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <Row st={st} />
}
```

A local bound to a read of the draft is a copy, not the draft: its paths
are not written.

```rx
-- reject: WRITE_TO_NON_SOURCE
import { createStore } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { let a = d; a.done := 1 }) }}>add</button>
  <p>{todos.done}</p>
}
```

Everything else is accepted, because nothing of it can keep the draft.
Reads are copies, wherever they go — a source, a record, an array, a fn, an
action, a closure's capture of the local:

```rx
-- accept
import { createStore, later } from "./store.js"
source saved: any := null
source list: any[] := []
fn keep(x) { x }
action stash(x) { saved := x }
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[]; sub: { n: number } }>({ done: 0, items: [], sub: { n: 0 } })
  <button onClick={() => { setTodos((d) => {
    saved := d
    saved := [d, { x: d }]
    saved := keep(keep(d))
    saved := true ? d : null
    stash(d.sub)
    list := [...d.items]
    let alias = d
    let n = d.done
    let xs = d.items
    later(() => { log(alias.done, n, len(xs)) })
  }) }}>keep</button>
  <p>{todos.done}</p>
}
```

and writes are the draft's: by path, through a loop's variable, with an
updater that reads the draft, by the draft's own methods, by a part read
off the result where it is called.

```rx
-- accept
import { createStore } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; step: number; items: { text: string; done: boolean }[] }>({ done: 0, step: 1, items: [] })
  st = createStore<{ n: number }>({ n: 0 })
  <button onClick={() => { setTodos((d) => {
    for (const x of [1, 2]) { d.done := d.done + x }
    for (const t of d.items) { t.done := true }
    d.done := v => v + d.step
    d.items.push({ text: "new", done: false })
    let i = d.items.findIndex((t) => t.text == "old")
    if (i >= 0) { d.items.splice(i, 1) }
    d.items := d.items.filter((t) => !t.done)
    return d
  }) }}>all</button>
  <button onClick={() => { st[1]((d) => { d.n := d.n + 1 }) }}>one</button>
  <p>{todos.done} {st[0].n}</p>
}
```

```rx
-- accept: whole-program
import { createStore, later } from "./store.js"
source saved: number := 0
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
  <button onClick={() => { setTodos((d) => { let n = d.done; d.done := n + 1; saved := d.done; later(() => { log(n) }) }) }}>add</button>
  <p>{todos.done} {saved}</p>
}
```

A scalar read out of the draft is a value of the callback's own: the
closure may keep it, and a source may take it. What the compiled callback
does with each of these — the copies, the loop, the updater — is run by
`compiler/test/node.mjs` against a draft that is revoked when the setter
returns.
