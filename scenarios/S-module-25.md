# S-module-25 — a library's draft: a store setter that hands a callback the state to change

Rules: MO-10i, W-1, MO-10g, 07 §5.

## Modules

```rx
-- module: ./store.d.rx
// as Solid 2's createStore is declared: its setter takes a callback whose parameter is the store's draft
export pure fn createStore<T>(init: T): [T, (update: (draft state: T) => T | void) => void]
export fn each(xs: string[], f: (x: { label: string }) => void): void
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

## Program

```rx
import { createStore } from "./store.js"
export default component App() {
  [todos, setTodos] = createStore<{ done: number; items: string[] }>({ done: 0, items: [] })
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
