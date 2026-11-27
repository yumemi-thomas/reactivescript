# S-module-50 — a kit in several modules behind one entry: a re-export

Rules exercised: MO-6e, MO-6d, RG-7a.

`kit/index.rx` re-exports the root (and its context, its type, its fn) and the item, each declared in a module of its
own. The app names them through the entry, by name and by namespace; the loaders resolve each to the module that
declares it, so the context the item reads is the one the root provides — and the one the app provides through the
entry's name.

## Modules

```rx
-- module: ./kit/root.rx
export context sel: { value: string; pick: (v: string) => void } = { value: "", pick: (v) => { } }
export type Opt = { value: string; label: string }
export component Root(p: { children: View }) {
  source value := ""
  action pick(v: string) { value := v }
  provide sel = { value: value, pick: pick }
  <div>{p.children}<b>{value}</b></div> }
export fn label(o: Opt): string => o.label.toUpperCase()
```

```rx
-- module: ./kit/item.rx
import { sel } from "./root.rx"
export component Item(p: { value: string; children: View }) { s = use sel
  <li onClick={() => { s.pick(p.value) }}>{p.children}{s.value == p.value ? "*" : ""}</li> }
```

```rx
-- module: ./kit/index.rx
export { Root, sel, label, Opt } from "./root.rx"
export { Item as Entry } from "./item.rx"
```

## Program

```rx
import * as Kit from "./kit/index.rx"
import { sel, label, Opt } from "./kit/index.rx"
component Mine() {
  provide sel = { value: "b", pick: (v) => undefined }
  <ul><Kit.Entry value="b">B</Kit.Entry></ul>
}
export default component App() {
  o: Opt = { value: "b", label: "banana" }
  <Kit.Root><ul><Kit.Entry value="a">A</Kit.Entry></ul></Kit.Root>
  <Mine />
  <p>{label(o)}</p>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `AB*BANANA` |

## Rejected variants

```rx
-- reject: DUPLICATE_DECLARATION
import { sel } from "./kit/index.rx"
import { sel } from "./kit/root.rx"
export default component App() { <p>{(use sel).value}</p> }
```

```rx
-- reject: DUPLICATE_DECLARATION
import { sel } from "./kit/root.rx"
export { Root as sel } from "./kit/root.rx"
export default component App() { <p>x</p> }
```

## Accepted variants

A name used here and given on: one export of one module, under one name.

```rx
-- accept
import { sel } from "./kit/root.rx"
export { sel } from "./kit/root.rx"
export default component App() { <p>{(use sel).value}</p> }
```
