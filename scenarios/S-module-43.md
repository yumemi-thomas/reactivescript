# S-module-43 — a module's default export: the row named `default`

Rules: MO-8u, MO-8, MO-10a, MO-11a, E-9.

## Modules

```rx
-- module: ./status.d.rx
// a utility that is its module's default export (`export default function useOnlineStatus()`)
export pure fn default(): ref boolean
```

```rx
-- module: ./card.d.rx
// a component that is its module's default export
export context theme
export component default(props: { title: string; children?: View }) uses(theme)
export component Themed(props: { children?: View }) provides(theme)
```

```rx
-- module: ./people.d.rx
export pure fn fetchPerson(id: string): Promise<string>
```

A JavaScript module's default export is the export named `default`. Its
row is named so — `export pure fn default(): ref boolean`, `export
component default(props: { … })` — and an `.rx` module imports it as
JavaScript does, under a name of its own: `import { default as
useOnlineStatus } from "./status.js"`. Nothing else is particular to it:
the row's words are the row's, and the name the program gives it is the
one it is called, applied and reported by.

Until 2026-11-25 `rx-declare` drafted a default export as a note to hand
it out by name from a JS module of the app's own, and every program that
used such a library had that module (solid-use's utilities, solid-marked's
component). Neither parser, neither checker and neither emitter needed a
change: only the draft, and saying so.

## Program

```rx
import { default as useOnlineStatus } from "./status.js"
import { default as Card, Themed } from "./card.js"
export default component App() {
  online = useOnlineStatus()
  <Themed><Card title="network">{online ? "online" : "offline"}</Card></Themed>
}
```

Accepted.

## Rejected variants

```rx
-- reject: INSTANTIATION_NOT_BOUND
import { default as useOnlineStatus } from "./status.js"
export default component App() {
  <p>{useOnlineStatus() ? "online" : "offline"}</p>
}
```

The row says a primitive (`ref`): made where the view reads it, it would
be made again on every change. The diagnostic names it as the program
does.

```rx
-- reject: CONTEXT_NOT_FOUND
import { default as Card } from "./card.js"
export default component App() {
  <Card title="network">online</Card>
}
```

A default-exported component's `uses(…)` is its row's, as any
component's.

```rx
-- reject: NOT_EXPORTED
import { default as Missing } from "./people.js"
export default component App() {
  <p>none</p>
}
```

A declaration that has no row named `default` declares no default export.
