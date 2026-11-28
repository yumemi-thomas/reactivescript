# S-module-21 — a primitive that wraps a Solid signal: a three-line module of JavaScript, declared in the words there are

Rules: MO-10c, MO-10a, MO-10b, E-10, MO-8.

## Modules

```rx
-- module: ./storage.d.rx
// beside ./storage.js, which is the whole of the adapter:
//   import { createSignal } from "solid-js"
//   import { makePersisted } from "@solid-primitives/storage"
//   export const persisted = (init, options) => makePersisted(createSignal(init), options)
export pure fn persisted(init: string, options?: { name?: string }): [ref string, (v: string) => void]
```

Some primitives take a Solid signal, a getter and a setter, and wrap it:
`makePersisted(createSignal("light"), { name: "theme" })` persists the
value, through the setter it hands back. An `.rx` source is not a Solid
signal tuple, and the program needs none. No word of a declaration says
"this parameter takes a signal" (`signal init` was one, MO-10h, and with it
the compiler made the signal; it was the only word that changed the
compiled call, for a handful of primitives): the signal is made where
signals are made, in JavaScript, in a module of the app's own that hands
back what MO-10b already reads — a reader, and a setter called from
handlers. The signal is the adapter's: nothing in the program writes it
except through the library. The value is read once, as an instantiation's
arguments are (E-10).

## Program

```rx
import { persisted } from "./storage.js"
export default component App() {
  [theme, setTheme] = persisted("light", { name: "theme" })
  <button onClick={() => { setTheme(theme == "light" ? "dark" : "light") }}>theme: {theme}</button>
}
```

Accepted.

## Rejected variants

```rx
-- reject: SNAPSHOT_ARGUMENT
import { persisted } from "./storage.js"
source initial: string := "light"
export default component App() {
  [theme, setTheme] = persisted(initial, { name: "theme" })
  <p>{theme}</p>
}
```

The initial value is read once: a later write of `initial` would be missed, so it is
`peek initial`, as for any instantiation (E-10).

```rx
-- types: TS2345
import { persisted } from "./storage.js"
export default component App() {
  [theme, setTheme] = persisted(1, { name: "theme" })
  <p>{theme}</p>
}
```

The value is checked against the parameter's type, as any argument is.
