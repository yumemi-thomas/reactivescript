# S-module-27 — a component given to JS that says nothing of where it renders it

Rules: MO-11s, MO-11l, MO-11n, R-f-5, RG-7b.

A JS fn may take a component and render it somewhere the declaration does
not say: a toast or portal helper, a plugin registry, a library with no
declaration at all. Rather than refuse the component (it would be
`COMPONENT_AS_VALUE`), the checker assumes the most cautious placement
(MO-11s): the component is applied under a root of its own, at any time,
with nothing from above the call credited to it — no `errored`, no
`loading`, no `provide`. Whatever the library really does, it cannot do
worse than that: a component that holds its own failures, waits behind its
own `loading` and reads only what it provides itself is safe anywhere. A
row that does say (`renders`, `renders(root, ctx…)`, `renders(later)`, a
factory) gives back what the call's surroundings provide.

## Modules

```rx
-- module: ./toasts.d.rx
// declared, but with no word for where it renders the component
export fn showToast(comp: Component, ms: number)
```

```rx
-- module: ./note.rx
import pure { fetch } from "./prelude"
export context tone: string
export component Note() {
  text = await fetch("note")
  <i>{text}</i>
}
export component Tinted() {
  <b class={use tone}>tinted</b>
}
```

## Program

```rx
import { showToast } from "./toasts.js"
import { register } from "./plugins.js"
import { Note, Tinted, tone } from "./note.rx"

component Toast() {
  errored fallback(e) { <p>no note</p> } {
    loading fallback { <p>…</p> } {
      <Note />
    }
  }
}
component Badge() {
  provide tone = "warm"
  <Tinted />
}
export default component App() {
  <button onClick={() => { showToast(Toast, 3000) }}>toast</button>
  <button onClick={() => { register({ name: "badge", view: Badge }) }}>plugin</button>
}
```

Accepted. `showToast` is declared with no placement word and `register`
(from `./plugins.js`) has no declaration at all; each is given a
component that stands on its own. The runners that execute have no such
modules to run.

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { showToast } from "./toasts.js"
import { Note } from "./note.rx"
export default component App() {
  errored fallback(e) { <p>failed</p> } {
    loading fallback { <p>…</p> } {
      <button onClick={() => { showToast(Note, 3000) }}>toast</button>
    }
  }
}
```

`Note`'s fetch can fail, and the `errored` above the call is not credited:
the toast may render under a root of the library's own (MO-11s). Give
`Note` its own boundary, as `Toast` does, or declare where `showToast`
renders it.

```rx
-- reject: CONTEXT_NOT_FOUND
import { register } from "./plugins.js"
import { Tinted, tone } from "./note.rx"
export default component App() {
  provide tone = "warm"
  <button onClick={() => { register({ view: Tinted }) }}>plugin</button>
}
```

The same for a context: `tone`, provided above the call, does not reach
`Tinted` under that root.
