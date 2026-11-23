# S-module-42 — a method of a declared value: a row of its own

Rules: MO-8t, MO-11u, MO-10b, MO-10g, R-io-3, R-f-5.

## Modules

```rx
-- module: ./kit.d.rx
// a toaster as three libraries export one: an object, or a function with methods, whose methods do something and
// answer the toast's id
export context region
export error Refused
export component Region(props: { children?: View }) provides(region)
export component Toaster(props: {}) uses(region)
export const toaster: { show(toast: Component): number; dismiss(id: number): void; count(): number; flush(): Promise<void> }
export fn toaster.show(toast: Component): number renders(Toaster)
export fn toast(message: string): number
export fn toast.success(message: string): number
export fn toast.promise(work: Promise<string>, on: { done: handler (answer: string) => void }): number
export pure fn toast.history(): string[]
export pure fn toast.load(id: string): Promise<string> rejects(Refused)
export pure fn work(): Promise<string>
```

A library's API is often an object: `toaster.show(…)`, `toast.success(…)`,
`query.set(…)`, `cookieStorage.setItem(…)`. Until 2026-11-25 a row named
an export and nothing below it, so a method was read by what its type
answers and no more: `toast.success("saved")` answers an id, so it was a
read — accepted in an equation or a view, where it shows a toast on every
computation — and a component given to `toaster.show(…)` was
`COMPONENT_AS_VALUE`, since no row said where it renders.

A method has a row of its own (MO-8t): `export fn toaster.show(…)`,
written beside `export const toaster` (or beside `export fn toast`, for a
function with methods). It is a fn's row, word for word — `fn` or `pure
fn`, `rejects(E)`, `handler` and `draft` on its parameters, `uses(c)`,
`renders(H)` — and the call `toaster.show(x)` is a call of that fn. A
method with no row is read by its type, as a declared result's function
field is (MO-10b): one that answers nothing, or a promise, is io.

## Program

```rx
import { toaster, toast, work, Toaster, Region } from "./kit.js"
context accent: string
component Saved() {
  <i class={use accent}>saved</i>
}
export default component App() {
  provide accent = "dark"
  source done := 0
  past = toast.history()
  <button onClick={() => { toaster.show(Saved) }}>save</button>
  <button onClick={() => { toast.success("saved") }}>say</button>
  <button onClick={() => { toast.promise(work(), { done: (answer) => { done := done + 1 } }) }}>wait</button>
  <button onClick={() => { toaster.dismiss(1) }}>close</button>
  <p>{past.length} shown before, {toaster.count()} now, {done} done</p>
  <Region><Toaster /></Region>
}
```

Accepted: each io method is called from a handler; the component given to
`toaster.show` reads a context provided above the `<Toaster>` that
renders it; the callback given to `toast.promise` is declared `handler`,
so it writes; `toast.history()` is `pure`, and `toaster.count()`, which
has no row, answers a number and is a read.

## Rejected variants

```rx
-- reject: IO_IN_REACTIVE
import { toast } from "./kit.js"
export default component App() {
  source saved := false
  id = saved ? toast.success("saved") : 0
  <button onClick={() => { saved := true }}>{id}</button>
}
```

A toast shown by an equation: it is shown again each time the equation is
computed. The method's row says `fn` — io, called from a handler or an
action.

```rx
-- reject: IO_IN_REACTIVE
import { toast } from "./kit.js"
export default component App() {
  <button onClick={toast.success("saved")}>say</button>
}
```

The method called where the handler is given (02 SC-4).

```rx
-- reject: CONTEXT_NOT_FOUND
import { toaster, Toaster, Region } from "./kit.js"
context accent: string
component Saved() {
  <i class={use accent}>saved</i>
}
component Themed(props: { children: View }) {
  provide accent = "dark"
  {props.children}
}
export default component App() {
  <Themed><button onClick={() => { toaster.show(Saved) }}>save</button></Themed>
  <Region><Toaster /></Region>
}
```

`renders(Toaster)` on the method: the component is checked beneath
`<Toaster>`, not where the method is called.

```rx
-- reject: IO_IN_REACTIVE
import { toaster } from "./kit.js"
export default component App() {
  <p>{toaster.dismiss(1)}</p>
}
```

A method with no row, whose type answers nothing: it is called for what
it does (MO-10b, for a declared value as for a declared result).

```rx
-- reject: IO_IN_REACTIVE
import { toaster } from "./kit.js"
export default component App() {
  <p>{toaster.flush()}</p>
}
```

…and one that answers a promise starts work on every computation.

```rx
-- reject: IO_IN_REACTIVE
import { toast } from "./kit.js"
export default component App() {
  <p>{toast.dismiss(1)}</p>
}
```

A method of a declared `fn`, with no row of its own: `toast` is io, and so
is what is called on it.

```rx
-- reject: IO_IN_REACTIVE
import { notify } from "./undeclared.js"
export default component App() {
  <p>{notify.success("saved")}</p>
}
```

The same of an import with no declaration at all (R-io-4): it is io, and
so are its methods. Until 2026-11-25 this was accepted, where
`notify("saved")` itself was refused.

```rx
-- reject: UNHANDLED_FAILURE
import { toast } from "./kit.js"
export default component App() {
  text = await toast.load("1")
  <p>{text}</p>
}
```

A method's `rejects(E)` is its row's, as a fn's.

```rx
-- accept
import { toast } from "./kit.js"
export default component App() {
  <ul>{for toast in ["a", "b"] { <li>{toast}{toast.length}</li> }}</ul>
  <button onClick={() => { toast.success("saved") }}>say</button>
}
```

The object of a method's row is the import by its scope (2026-11-26).
Inside the loop `toast` is the loop's variable, and `toast.length` is a
member of a string; outside it, `toast.success` is the declared method.
Until then any second `toast` in the module was `SHADOWED_IMPORT`, since
the rows were applied to the name wherever it was written.

```rx
-- reject: SHADOWED_IMPORT
import { toast } from "./kit.js"
component Row() {
  toast = { success: (m) => m }
  <li>{toast.success("a")}</li>
}
export default component App() {
  <ul><Row /></ul>
}
```

A declaration that shadows an import is MO-1d's refusal, as for any
import, and it is said once (it was said twice: once for the methods'
rows, once for the declaration).
