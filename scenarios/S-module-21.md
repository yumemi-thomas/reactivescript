# S-module-21 — a primitive that wraps a Solid signal: `signal` parameters

Rules: MO-10h, MO-10a, MO-10b, E-10, MO-8.

## Modules

```rx
-- module: ./storage.d.rx
// as @solid-primitives/storage declares it: makePersisted takes a Solid signal and hands back its persisted parts
export pure fn makePersisted(signal init: string, options?: { name?: string }): [ref string, (v: string) => void, any, any]
```

Some primitives take a Solid signal, a getter and a setter, and wrap it:
`makePersisted(createSignal("light"), { name: "theme" })` persists the
value, through the setter it hands back. An `.rx` source is not a Solid
signal tuple, and the program needs none: `signal init` on the parameter
says the library takes a signal, so the program passes its initial value
and the compiler makes the signal of it (`__rt.signal(…)`). The program
reads and writes through what comes back (MO-10b): a reader, and a setter
called from handlers. The signal made for it is the library's: nothing in
the program writes it except through the library. The value is read once,
as an instantiation's arguments are (E-10).

## Program

```rx
import { makePersisted } from "./storage.js"
export default component App() {
  [theme, setTheme] = makePersisted("light", { name: "theme" })
  <button onClick={() => { setTheme(theme == "light" ? "dark" : "light") }}>theme: {theme}</button>
}
```

Accepted.

## Rejected variants

```rx
-- reject: SNAPSHOT_ARGUMENT
import { makePersisted } from "./storage.js"
source initial: string := "light"
export default component App() {
  [theme, setTheme] = makePersisted(initial, { name: "theme" })
  <p>{theme}</p>
}
```

The initial value is read once: a later write of `initial` would be missed, so it is
`peek initial`, as for any instantiation (E-10).

```rx
-- types: TS2345
import { makePersisted } from "./storage.js"
export default component App() {
  [theme, setTheme] = makePersisted(1, { name: "theme" })
  <p>{theme}</p>
}
```

The signal is of the value's type, checked against the parameter's.
