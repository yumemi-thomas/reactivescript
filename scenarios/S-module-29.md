# S-module-29 — a generic component's row: its type parameters reach its props

Rules: MO-8d, MO-11a, MO-11q, MO-10g, TY-4b.

## Modules

```rx
-- module: ./kit.d.rx
// A kit's select and one of its parts. Each takes the type of the options it is given: the value it holds and what
// its callback is called with are that type (Kobalte's `Select<Option>`, a table's `Row<TData>`).
export component Picker<Option>(props: { value?: Option; options: Option[]; onPick?: handler (v: Option) => void })
export component Chooser<Option>(props: { options: Option[]; onPick?: (v: Option) => void })
export component Kit.Row<T extends { id: string }>(props: { row: T; label: (row: T) => string })
```

A component's row may have TypeScript type parameters, as a fn's may
(MO-8d): `component Picker<Option>(props: { … })`. They are TypeScript's
text, written between the name and the props, and the checker reads none of
it: a prop is the row it was (`handler`, `renders`, a `Component`), whatever
type it ranges over. The declaration's `.d.ts` (TY-4b) and the boundary
check (TY-6) carry them as written, so the library's inference reaches the
`.rx` that applies the component: `onPick`'s closure is given a `string`
because `options` is `string[]`.

## Program

```rx
import { Picker, Kit } from "./kit.js"

export default component App() {
  source city: string := "Oslo"
  <Picker value={city} options={["Oslo", "Lima"]} onPick={(c) => { city := c }} />
  <Kit.Row row={{ id: "a", name: "Ada" }} label={(r) => r.name} />
}
```

Accepted by the checker and by TypeScript: `c` is a `string`, and `r` has
the row's `name`.

## Rejected variants

```rx
-- types: TS2322
import { Picker } from "./kit.js"
export default component App() {
  source city: string := "Oslo"
  <Picker value={city} options={[1, 2]} onPick={(c) => { city := c }} />
}
```

The value is a `string` and the options are numbers: one `Option` cannot be
both, and TypeScript refuses it where the component is applied.

```rx
-- types: TS2339
import { Kit } from "./kit.js"
export default component App() {
  <Kit.Row row={{ id: "a", name: "Ada" }} label={(r) => r.title} />
}
```

A member component's parameters are its own (MO-11q): the row given has no
`title`.

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
import { Chooser } from "./kit.js"
export default component App() {
  source city: string := "Oslo"
  <Chooser options={["Oslo", "Lima"]} onPick={(c) => { city := c }} />
}
```

The type parameters change nothing the checker reads: `Chooser`'s `onPick`
is not marked `handler`, so its closure is a pure function (MO-10g), as it
would be on a row with no type parameters.
