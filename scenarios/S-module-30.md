# S-module-30 — a component's props named by their type: the record after `&` carries the words

Rules: MO-8o, MO-8d, MO-11a, MO-11b, MO-10g, TY-4b.

## Modules

```rx
-- module: ./kit.d.rx
// The props are a type (here the declaration's own; for a library with types, the one it exports:
// `import("@kobalte/core/select").SelectRootProps<Option>`). Only a field that carries a word is written again.
export type PickerProps<O> = { value?: O; options: O[]; onPick?: (v: O) => void; label?: string }
export component Picker<Option>(props: PickerProps<Option> & { onPick?: handler (v: Option) => void })
export component Lister<Option>(props: PickerProps<Option> & { onPick?: (v: Option) => void })
export component Plain(props: PickerProps<string>)
```

A component's props may be written as a type, `props: PickerProps<Option>`,
in place of a record of every field (MO-8o). The type is TypeScript's text:
the checker reads none of it, and a prop it does not see is passed as any
undeclared prop is (MO-11b). What the checker does read of a prop — a
function type and its `handler`, `Component`, a render prop, `catches(…)`,
`renders` — is written in a record after `&`, with only the fields that say
it. TypeScript reads the row as the intersection it spells, so the
declaration's `.d.ts` (TY-4b) and the boundary check (TY-6) carry it as
written; a union of records (a select that holds one option or several) is
props as it stands, which no one record is.

## Program

```rx
import { Picker, Plain } from "./kit.js"

export default component App() {
  source city: string := "Oslo"
  <Picker value={city} options={["Oslo", "Lima"]} label="City" onPick={(c) => { city := c }} />
  <Plain options={["a"]} />
}
```

Accepted by the checker and by TypeScript: `onPick` is a `handler`, so its
closure may write a source, and `c` is a `string` through the props' type.

## Rejected variants

```rx
-- types: TS2322
import { Picker } from "./kit.js"
export default component App() {
  source city: string := "Oslo"
  <Picker value={city} options={["Oslo", "Lima"]} label={3} onPick={(c) => { city := c }} />
}
```

`label` is in no record of the row, and it is typed all the same: the
props are `PickerProps<string>`, whose `label` is a `string`.

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
import { Lister } from "./kit.js"
export default component App() {
  source city: string := "Oslo"
  <Lister options={["Oslo", "Lima"]} onPick={(c) => { city := c }} />
}
```

The record is read as a record of props always was: `Lister`'s `onPick` is
a function type with no `handler`, so its closure is a pure function
(MO-10g).
