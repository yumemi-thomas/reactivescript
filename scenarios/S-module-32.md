# S-module-32 — the record after a props' type is held to that type: a field narrows a prop, it does not retype it

Rules: MO-8o, TY-6f, TY-6b, TY-6c, MO-11a, MO-10g, TY-4b.

## Modules

```rx
-- module: ./kit.d.rx
// `Picker`'s record says again what the props' type says of `onPick` (with the word), and narrows `size`: both are
// what the type takes. `Mislabeled` gives `label` a type the props' type does not have for it.
export type PickerProps<O> = { value?: O; options: O[]; onPick?: (v: O) => void; label?: string; size?: "s" | "m" | "l" }
export component Picker<Option>(props: PickerProps<Option> & { onPick?: handler (v: Option) => void; size?: "s" | "m" })
export component Mislabeled(props: PickerProps<string> & { label?: number })
```

A declared component's props may be a type and, after `&`, a record of the
fields that carry words (MO-8o). TypeScript reads the row as the
intersection it spells, and an intersection can only narrow: whatever the
record says, `P & { … }` is still something the library's component takes,
so holding the component to the row (13 TY-6a) says nothing of the record.
It is held on its own (TY-6f): each field of the record names a prop the
props' type has, and the type the field is written with is one the
library's type for that prop takes — the same, or narrower (`size` above
leaves `"l"` out). The direction is the boundary's (TY-6b): a declaration
may say less than the library accepts, never something else.

A field that fails this is `DECLARATION_MISMATCH` on the row, naming the
prop and both types:

```
kit.d.rx:3:1 - error DECLARATION_MISMATCH: Mislabeled: `label` is written `number` in the record after the props' type,
and the library's type for that prop does not take it: the record may narrow a prop of PickerProps<string>, not give it
another type (MO-8o)
  Type 'number' is not assignable to type 'string | undefined'.
```

and a field the type has no prop for (`onPicked?: handler …`, a typing
slip that would leave the real `onPick` without its word) is one too. The
check needs the module's own types: for a module that has none, as here,
the declaration is all there is (TY-6c) and nothing is held — the
variants below show what such a record then does to the program
(`tooling/rx-language-server/test/tsc.js` runs the check against a typed
module; the unit `a_props_record_is_held_to_the_props_type` reads the
check the crate writes).

## Program

```rx
import { Picker } from "./kit.js"

export default component App() {
  source city: string := "Oslo"
  <Picker value={city} options={["Oslo", "Lima"]} label="City" size="m" onPick={(c) => { city := c }} />
}
```

Accepted by the checker and by TypeScript: `onPick` is a `handler` through
the record, `label` a `string` through the type, `size` one of the two the
record keeps.

## Rejected variants

```rx
-- types: TS2322
import { Picker } from "./kit.js"
export default component App() {
  <Picker options={["Oslo"]} size="l" />
}
```

The record narrowed `size`: `"l"` is the library's, and not the
declaration's. A declaration may say less (TY-6b).

```rx
-- types: TS2322
import { Mislabeled } from "./kit.js"
export default component App() {
  <Mislabeled options={["Oslo"]} label="City" />
}
```

What a retyped field does where nothing holds it: `label` is a `string`
to the type and a `number` to the record, so it is neither, and the
program that passes the library's own `label` is refused for the
declaration's mistake. With the module's types, the declaration is
refused instead (TY-6f).
