# S-module-48 — a kit in several modules

Rules exercised: RG-4c, RG-7b, MO-6d, MO-7, 07 §2.

What a kit of parts written in several `.rx` modules is today. The root and the part that **shows the view the root
carries** are in one module: a context that holds a view is that module's (proposals/27), and is checked at each place
that shows it. The other parts are anywhere: they read the kit's exported contexts. The caller names the parts by a
namespace for each module, or by their names.

Refused, and written otherwise: an exported context that holds a view; the part that shows it in another module; a view
a context holds given on as an argument (`renderItem={use item}`), which is written as a view that shows it.

## Modules

```rx
-- module: ./root.rx
export type Opt = { value: string; label: string }
context itemView: (r: { item: any }) => View
export context select: { options: any[]; value: string; pick: (v: string) => void } = { options: [], value: "", pick: (v) => { } }
export component Root<T extends { value: string }>(p: { options: T[]; item: (r: { item: T }) => View; children: View }) {
  source value := ""
  action pick(v: string) { value := v }
  provide select = { options: p.options, value: value, pick: pick }
  provide itemView = p.item
  <div>{p.children}</div> }
export component Listbox() { s = use select
  <ul>{for o in s.options { <use.itemView item={o} /> }}</ul> }
```

```rx
-- module: ./parts.rx
import { select } from "./root.rx"
export component Trigger(p: { children: View }) { s = use select
  <button>{p.children}{s.value == "" ? "?" : s.value}</button> }
export component Item(p: { value: string; children: View }) { s = use select
  <li onClick={() => { s.pick(p.value) }}>{p.children}{s.value == p.value ? "*" : ""}</li> }
export component Count() { s = use select
  <i>{len(s.options)}</i> }
```

## Program

```rx
import * as Select from "./root.rx"
import * as Part from "./parts.rx"
export default component App() {
  source opts := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }]
  source on := true
  <Select.Root options={opts}>{view item (r) { <Part.Item value={r.item.value}>{r.item.label}</Part.Item> }}<Part.Trigger>t</Part.Trigger><Select.Listbox /><Part.Count /></Select.Root>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `t?AppleBanana2` |
| 1 | handler `opts := [{ value: "c", label: "Cherry" }]` | `t?Cherry1` |

## Variant: the carried view shown twice

```rx
import * as Select from "./root.rx"
import * as Part from "./parts.rx"
export default component App() {
  source opts := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }]
  source on := true
  <Select.Root options={opts}>{view item (r) { <Part.Item value={r.item.value}>{r.item.label}</Part.Item> }}<Select.Listbox /><Select.Listbox /></Select.Root>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `AppleBananaAppleBanana` |

## Variant: a kit inside its own item

```rx
import * as Select from "./root.rx"
import * as Part from "./parts.rx"
export default component App() {
  source opts := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }]
  source on := true
  <Select.Root options={opts}>{view item (r) { <Part.Item value={r.item.value}>{r.item.label}<Select.Root options={opts}>{view item (q) { <Part.Item value={q.item.value}>{q.item.label}</Part.Item> }}<Part.Count /></Select.Root></Part.Item> }}<Select.Listbox /></Select.Root>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `Apple2Banana2` |

## Variant: by their names

```rx
import { Root, Listbox } from "./root.rx"
import { Trigger, Item, Count } from "./parts.rx"
export default component App() {
  source opts := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }]
  source on := true
  {if on { <Root options={opts}>{view item (r) { <Item value={r.item.value}>{r.item.label}</Item> }}<Listbox /></Root> } else { <i>off</i> }}
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `AppleBanana` |
| 1 | handler `on := false` | `off` |

## Variant: a view a context holds, given on: written as a view that shows it

```rx
type Opt = { value: string; label: string }
context item: (r: { item: Opt }) => View
component Rows(p: { rows: Opt[]; renderItem: (r: { item: Opt }) => View }) { <ul>{for o in p.rows { <li><p.renderItem item={o} /></li> }}</ul> }
component Listbox(p: { options: Opt[] }) { <Rows rows={p.options}>{view renderItem (q) { <use.item item={q.item} /> }}</Rows> }
component Root(p: { options: Opt[]; item: (r: { item: Opt }) => View; children: View }) { provide item = p.item
  <div>{p.children}</div> }
export default component App() { source opts: Opt[] := [{ value: "a", label: "Apple" }]
  <Root options={opts}>{view item (r) { <b>{r.item.label}</b> }}<Listbox options={opts} /></Root> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `Apple` |

## Variant: … with what it was given spread

```rx
type Opt = { value: string; label: string }
context item: (r: { item: Opt }) => View
component Rows(p: { rows: Opt[]; renderItem: (r: { item: Opt }) => View }) { <ul>{for o in p.rows { <li><p.renderItem item={o} /></li> }}</ul> }
component Listbox(p: { options: Opt[] }) { <Rows rows={p.options}>{view renderItem (q) { <use.item {...q} /> }}</Rows> }
component Root(p: { options: Opt[]; item: (r: { item: Opt }) => View; children: View }) { provide item = p.item
  <div>{p.children}</div> }
export default component App() { source opts: Opt[] := [{ value: "a", label: "Apple" }]
  <Root options={opts}>{view item (r) { <b>{r.item.label}</b> }}<Listbox options={opts} /></Root> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `Apple` |

## Variant: `renderItem={use item}`, the view block it stands for (L2, 2026-11-26)

A view with a parameter given on is the view that shows it with everything it is passed: read when the module is
loaded as `{view renderItem (r) { <use.item {...r} /> }}` (RG-4c). Refused before 2026-11-26.

```rx
type Opt = { value: string; label: string }
context item: (r: { item: Opt }) => View
component Rows(p: { rows: Opt[]; renderItem: (r: { item: Opt }) => View }) { <ul>{for o in p.rows { <li><p.renderItem item={o} /></li> }}</ul> }
component Listbox(p: { options: Opt[] }) { <Rows rows={p.options} renderItem={use item} /> }
component Root(p: { options: Opt[]; item: (r: { item: Opt }) => View; children: View }) { provide item = p.item
  <div>{p.children}</div> }
export default component App() { source opts: Opt[] := [{ value: "a", label: "Apple" }]
  <Root options={opts}>{view item (r) { <b>{r.item.label}</b> }}<Listbox options={opts} /></Root> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `Apple` |

## Rejected variants

The part that shows the view needs the root above it.

```rx
-- reject: CONTEXT_NOT_FOUND
import * as Select from "./root.rx"
import * as Part from "./parts.rx"
export default component App() {
  source opts := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }]
  source on := true
  <Select.Listbox />
}
```

```rx
-- types: TS2551
import * as Select from "./root.rx"
import * as Part from "./parts.rx"
export default component App() {
  source opts := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }]
  source on := true
  <Select.Root options={opts}>{view item (r) { <Part.Item value={r.item.value}>{r.item.lable}</Part.Item> }}<Select.Listbox /></Select.Root>
}
```
