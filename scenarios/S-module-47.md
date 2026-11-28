# S-module-47 — a kit's parts by a namespace

Rules exercised: MO-6d, MO-6a, RG-4a, RG-7b, SV-7d, 07 §2.

`import * as Select from "./select.rx"` names a module; `<Select.Root>`, `<Select.Item>` are its exported components, and
`Select.Opt` its exported type. Two kits whose parts have the same names (`Root`, `Trigger`, `Item`) are used together. The
namespace is no value, and nothing is made for it: the members the module names are its imports.

## Modules

```rx
-- module: ./select.rx
export type Opt = { value: string; label: string }
export type RootProps<T> = { options: T[]; item: (r: { item: T }) => View; children: View }
context itemView: (r: { item: any }) => View
export context select: { options: any[]; value: string; pick: (v: string) => void } = { options: [], value: "", pick: (v) => { } }
export component Root<T extends { value: string }>(p: RootProps<T>) {
  source value := ""
  action pick(v: string) { value := v }
  provide select = { options: p.options, value: value, pick: pick }
  provide itemView = p.item
  <div>{p.children}</div> }
export component Trigger(p: { children: View }) { s = use select
  <button>{p.children}{s.value == "" ? "?" : s.value}</button> }
export component Listbox() { s = use select
  <ul>{for o in s.options { <use.itemView item={o} /> }}</ul> }
export component Item(p: { value: string; children: View }) { s = use select
  <li onClick={() => { s.pick(p.value) }}>{p.children}{s.value == p.value ? "*" : ""}</li> }
export component Label(p: { children: View }) { <span>{p.children}</span> }
```

```rx
-- module: ./menu.rx
export context menu: { open: boolean; toggle: () => void } = { open: false, toggle: () => undefined }
export component Root(p: { children: View }) {
  source open := false
  action toggle() { open := !open }
  provide menu = { open: open, toggle: toggle }
  <nav>{p.children}</nav> }
export component Trigger(p: { children: View }) { m = use menu
  <button onClick={m.toggle}>{p.children}{m.open ? "-" : "+"}</button> }
export component Content(p: { children: View }) { m = use menu
  {if m.open { <menu>{p.children}</menu> }} }
export component Item(p: { children: View; disabled?: boolean }) { <li>{p.children}{p.disabled ? "!" : ""}</li> }
```

```rx
-- module: ./page.rx
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export component Page() {
  source opts := [{ value: "a", label: "Apple" }]
  <Menu.Root><Menu.Trigger>m</Menu.Trigger><Menu.Content><Menu.Item><Select.Root options={opts}>{view item (r) { <Select.Item value={r.item.value}><Select.Label>{r.item.label}</Select.Label></Select.Item> }}<Select.Listbox /></Select.Root></Menu.Item></Menu.Content></Menu.Root>
}
```

## Program

```rx
import * as Pages from "./page.rx"
export default component App() { <main><Pages.Page /></main> }
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `m+` |

## Variant: a select: the root's generic props, the option's view, the parts

```rx
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() {
  source opts := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }]
  <Select.Root options={opts}>{view item (r) { <Select.Item value={r.item.value}><Select.Label>{r.item.label}</Select.Label></Select.Item> }}<Select.Trigger>pick</Select.Trigger><Select.Listbox /></Select.Root>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `pick?AppleBanana` |
| 1 | handler `opts := [{ value: "c", label: "Cherry" }]` | `pick?Cherry` |

## Variant: the option's type through the namespace

```rx
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() {
  source opts: Select.Opt[] := [{ value: "a", label: "Apple" }]
  <Select.Root options={opts}>{view item (r) { <Select.Item value={r.item.value}><Select.Label>{r.item.label}</Select.Label></Select.Item> }}<Select.Listbox /></Select.Root>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `Apple` |

## Variant: a namespace and named imports of one module

```rx
import * as Select from "./select.rx"
import { Item as Entry, Label } from "./select.rx"
import * as Menu from "./menu.rx"
import { Root as MenuRoot } from "./menu.rx"
export default component App() {
  source opts := [{ value: "a", label: "Apple" }]
  source on := true
  <MenuRoot><Menu.Item><Select.Root options={opts}>{view item (r) { <Entry value={r.item.value}><Label>{r.item.label}</Label></Entry> }}<Select.Listbox /></Select.Root></Menu.Item>{if on { <Menu.Trigger>m</Menu.Trigger> }}</MenuRoot>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `Applem+` |
| 1 | handler `on := false` | `Apple` |

## Variant: a generic type of the kit, applied: its views are views

```rx
import * as Select from "./select.rx"
component Mine(p: Select.RootProps<Select.Opt>) { <Select.Root options={p.options}>{view item (r) { <p.item item={r.item} /> }}{p.children}</Select.Root> }
export default component App() { <Mine options={[{ value: "a", label: "A" }]}>{view item (r) { <Select.Item value={r.item.value}>{r.item.label}</Select.Item> }}<Select.Listbox /></Mine> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `A` |

## Variant: one module under two names

```rx
import * as A from "./menu.rx"
import * as B from "./menu.rx"
export default component App() { <A.Root><B.Trigger>t</B.Trigger><A.Content><B.Item>i</B.Item></A.Content></A.Root> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `t+` |

## Variant: text and a string that say `Menu.Item` are text

```rx
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() { <Menu.Root><Menu.Trigger>Menu.Item is a part; "Menu.Root" too</Menu.Trigger></Menu.Root> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `Menu.Item is a part; "Menu.Root" too+` |

## Accepted variants

```rx
-- accept
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() { <p>x</p> }
```

```rx
-- accept
import * as Select from "./select.rx"
fn label(o: Select.Opt): string => o.label
export default component App() { o: Select.Opt = { value: "a", label: "A" }
  <p>{label(o)}</p> }
```

```rx
-- accept
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
component Each(p: { children: (s: { i: number }) => View }) { <ol><p.children i={1} /></ol> }
export default component App() { <Each>{view (s) { <Menu.Item>{s.i}</Menu.Item> }}</Each> }
```

```rx
-- accept
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() { source Menu := 1
  <p>{Menu}</p> }
```

## Rejected variants

A namespace is no value.

```rx
-- reject: UNBOUND
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() { x = Menu
  <p>{str(x)}</p> }
```

```rx
-- reject: UNBOUND
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() { x = Menu.Root
  <p>{str(x)}</p> }
```

```rx
-- reject: UNKNOWN_COMPONENT
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() { <Menu>x</Menu> }
```

```rx
-- reject: UNBOUND
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
component Slot(props: { part: View }) { <p>{props.part}</p> }
export default component App() { <Slot part={Menu.Item} /> }
```

```rx
-- reject: NOT_EXPORTED
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() { <Menu.Root><Menu.Nope /></Menu.Root> }
```

```rx
-- reject: UNKNOWN_COMPONENT
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() { <Menu.menu /> }
```

```rx
-- reject: NOT_EXPORTED
import * as Select from "./select.rx"
export default component App() { o: Select.Nope = { value: "a" }
  <p>{str(o)}</p> }
```

```rx
-- reject: PARSE
import * as menu from "./menu.rx"
export default component App() { <menu.Root>x</menu.Root> }
```

A part's shape is held through the namespace.

```rx
-- reject: CONTENT_MODEL
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() {
  
  <p><Menu.Item>x</Menu.Item></p>
}
```

```rx
-- reject: VIEW_NOT_SHOWN
import * as Select from "./select.rx"
component Mine(p: Select.RootProps<Select.Opt>) { x = [p.children]
  <p>{len(x)}</p> }
export default component App() { <Mine options={[]}>{view item (r) { <b>x</b> }}c</Mine> }
```

```rx
-- types: TS2551
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() {
  source opts := [{ value: "a", label: "Apple" }]
  <Select.Root options={opts}>{view item (r) { <Select.Item value={r.item.value}><Select.Label>{r.item.lable}</Select.Label></Select.Item> }}<Select.Listbox /></Select.Root>
}
```

```rx
-- types: TS2322
import * as Select from "./select.rx"
import * as Menu from "./menu.rx"
export default component App() {
  
  <Menu.Root><Menu.Item disabled={3}>x</Menu.Item></Menu.Root>
}
```

```rx
-- types: TS2741
import * as Select from "./select.rx"
export default component App() { o: Select.Opt = { value: "a", lable: "A" }
  <p>{o.value}</p> }
```
