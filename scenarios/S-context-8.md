# S-context-8 — a context that holds a view

Rules: RG-4c, RG-7b, SV-7d (proposals/27).

A context whose declared type is `View`, or a function giving one, carries a view a component was given to the
places that show it: `provide item = props.item`, then `{use item}`, or `<use.item row={r} />` for one with a
parameter. It is shown and nothing else, and it is not exported: it is provided and shown in the module that declares
it, so every place that shows it is checked there, and what a caller in any module gives is checked against what the
components' signatures say. The view is made where it is shown, each time: what it reads from contexts, what it waits
on and fails with are that place's, then the provider's.

The program: a select in the shape of Kobalte's (the parts are named `SelectItem`, not `Select.Item`: a record of
components is not a value in `.rx`). The caller gives the item's view and places the listbox, in a portal.

## Modules

```rx
-- module: ./select.rx
export type Opt = { value: string; label: string }
context itemComponent: (props: { item: Opt }) => View
context item: Opt
export context select: { options: Opt[]; value: string; open: boolean; placeholder: string; pick: (v: string) => void; toggle: () => void }
export component Select(p: { options: Opt[]; placeholder?: string; itemComponent: (props: { item: Opt }) => View; children: View }) {
  source value := ""
  source open := false
  action pick(v: string) { value := v
    open := false }
  action toggle() { open := !open }
  provide select = { options: p.options, value: value, open: open, placeholder: p.placeholder ?? "", pick: pick, toggle: toggle }
  provide itemComponent = p.itemComponent
  <div>{p.children}</div> }
export component SelectTrigger(p: { children: View }) { s = use select
  <button onClick={() => { s.toggle() }}>{p.children}</button> }
export component SelectValue(p: { children: (state: { selectedOption: Opt }) => View }) { s = use select
  chosen = filter(s.options, (o) => o.value == s.value)
  <span>{if len(chosen) == 0 { {s.placeholder} } else { <p.children selectedOption={chosen[0]} /> }}</span> }
export component SelectIcon() { <i>v</i> }
export component SelectPortal(p: { children: View }) { {portal { {p.children} }} }
export component SelectContent(p: { children: View }) { s = use select
  {if s.open { <section>{p.children}</section> }} }
export component SelectListbox() { s = use select
  <ul>{for o in s.options { <use.itemComponent item={o} /> }}</ul> }
export component SelectItem(p: { item: Opt; children: View }) { s = use select
  provide item = p.item
  <li onClick={() => { s.pick(p.item.value) }}>{p.children}</li> }
export component SelectItemLabel(p: { children: View }) { <span>{p.children}</span> }
export component SelectItemIndicator(p: { children?: View }) { s = use select
  it = use item
  {if s.value == it.value { <b>{p.children ?? "*"}</b> }} }
```

```rx
-- module: ./combobox.rx
context itemComponent: (props: { item: string }) => View
context item: string
export context combobox: { shown: string[]; query: string; value: string; open: boolean; type: (q: string) => void; pick: (v: string) => void; toggle: () => void }
export component Combobox(p: { options: string[]; itemComponent: (props: { item: string }) => View; children: View }) {
  source query := ""
  source value := ""
  source open := false
  shown = filter(p.options, (o) => query == "" || o == query)
  action type(q: string) { query := q
    open := true }
  action pick(v: string) { value := v
    query := v
    open := false }
  action toggle() { open := !open }
  provide combobox = { shown: shown, query: query, value: value, open: open, type: type, pick: pick, toggle: toggle }
  provide itemComponent = p.itemComponent
  <div>{p.children}</div> }
export component ComboboxControl(p: { children: View }) { <div>{p.children}</div> }
export component ComboboxInput() { c = use combobox
  <input value={c.query} onInput={(e) => { c.type(e.target.value) }} /> }
export component ComboboxTrigger(p: { children: View }) { c = use combobox
  <button onClick={() => { c.toggle() }}>{p.children}</button> }
export component ComboboxIcon() { <i>v</i> }
export component ComboboxPortal(p: { children: View }) { {portal { {p.children} }} }
export component ComboboxContent(p: { children: View }) { c = use combobox
  {if c.open { <section>{p.children}</section> }} }
export component ComboboxListbox() { c = use combobox
  <ul>{for o in c.shown { <use.itemComponent item={o} /> }}</ul> }
export component ComboboxItem(p: { item: string; children: View }) { c = use combobox
  provide item = p.item
  <li onClick={() => { c.pick(p.item) }}>{p.children}</li> }
export component ComboboxItemLabel(p: { children: View }) { <span>{p.children}</span> }
export component ComboboxItemIndicator() { c = use combobox
  it = use item
  {if c.value == it { <b>*</b> }} }
```

```rx
-- module: ./pagination.rx
context itemComponent: (props: { page: number }) => View
context ellipsisComponent: () => View
export context pagination: { count: number; page: number; go: (n: number) => void }
fn range(n: number): number[] { n == 0 ? [] : [...range(n - 1), n] }
export component Pagination(p: { count: number; itemComponent: (props: { page: number }) => View; ellipsisComponent: () => View; children: View }) {
  source page := 1
  action go(n: number) { page := n }
  provide pagination = { count: p.count, page: page, go: go }
  provide itemComponent = p.itemComponent
  provide ellipsisComponent = p.ellipsisComponent
  <nav><ul>{p.children}</ul></nav> }
export component PaginationItems() { c = use pagination
  {for n in range(c.count) {
    {if n == 1 || n == c.count || (n >= c.page - 1 && n <= c.page + 1) { <use.itemComponent page={n} /> } else {
      {if n == c.page - 2 || n == c.page + 2 { <use.ellipsisComponent /> }} }} }} }
export component PaginationItem(p: { page: number; children: View }) { c = use pagination
  <li><button onClick={() => { c.go(p.page) }}>{c.page == p.page ? "[" : ""}{p.children}{c.page == p.page ? "]" : ""}</button></li> }
export component PaginationEllipsis(p: { children?: View }) { <li>{p.children ?? "…"}</li> }
export component PaginationPrevious(p: { children: View }) { c = use pagination
  <li><button onClick={() => { c.go(c.page - 1) }}>{p.children}</button></li> }
export component PaginationNext(p: { children: View }) { c = use pagination
  <li><button onClick={() => { c.go(c.page + 1) }}>{p.children}</button></li> }
```

## Program

```rx
import { Select, SelectTrigger, SelectValue, SelectIcon, SelectPortal, SelectContent, SelectListbox, SelectItem, SelectItemLabel, SelectItemIndicator } from "./select.rx"
export default component App() {
  source fruits := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }]
  <Select options={fruits} placeholder="Pick">
    {view itemComponent (props) { <SelectItem item={props.item}><SelectItemLabel>{props.item.label}</SelectItemLabel><SelectItemIndicator>!</SelectItemIndicator></SelectItem> }}
    <SelectTrigger><SelectValue>{view (state) { {state.selectedOption.label} }}</SelectValue><SelectIcon /></SelectTrigger>
    <SelectPortal><SelectContent><SelectListbox /></SelectContent></SelectPortal>
  </Select> }
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `Pickv` |  |
| 1 | handler `open := true` | `Pickv » AppleBanana` |  |
| 2 | handler `value := "b"` | `Bananav » AppleBanana!` |  |
| 3 | handler `fruits := [{ value: "c", label: "Cherry" }, { value: "b", label: "Banana" }]` | `Bananav » CherryBanana!` |  |

## Variant: a combobox: the list is what the input leaves

```rx
import { Combobox, ComboboxControl, ComboboxInput, ComboboxTrigger, ComboboxIcon, ComboboxPortal, ComboboxContent, ComboboxListbox, ComboboxItem, ComboboxItemLabel, ComboboxItemIndicator } from "./combobox.rx"
export default component App() {
  <Combobox options={["Apple", "Banana", "Cherry"]}>
    {view itemComponent (props) { <ComboboxItem item={props.item}><ComboboxItemLabel>{props.item}</ComboboxItemLabel><ComboboxItemIndicator /></ComboboxItem> }}
    <ComboboxControl><ComboboxInput /><ComboboxTrigger><ComboboxIcon /></ComboboxTrigger></ComboboxControl>
    <ComboboxPortal><ComboboxContent><ComboboxListbox /></ComboboxContent></ComboboxPortal>
  </Combobox> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `v` |  |
| 1 | handler `open := true` | `v » AppleBananaCherry` |  |
| 2 | handler `value := "Banana"` | `v » AppleBanana*Cherry` |  |
| 3 | handler `query := "Banana"` | `v » Banana*` |  |

## Variant: a pagination: two views, one with no parameter

```rx
import { Pagination, PaginationItems, PaginationItem, PaginationEllipsis, PaginationPrevious, PaginationNext } from "./pagination.rx"
export default component App() {
  <Pagination count={10}>
    {view itemComponent (props) { <PaginationItem page={props.page}>{props.page}</PaginationItem> }}
    {view ellipsisComponent () { <PaginationEllipsis>..</PaginationEllipsis> }}
    <PaginationPrevious>P</PaginationPrevious>
    <PaginationItems />
    <PaginationNext>N</PaginationNext>
  </Pagination> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `P[1]2..10N` |  |
| 1 | handler `page := 5` | `P1..4[5]6..10N` |  |
| 2 | handler `page := 10` | `P1..9[10]N` |  |

## Variant: a view of no parameter, shown by a part the provider places, twice: each has its own

```rx
context slot: View
context where: string = "out"
component Made() { effect () { log("made") }
  <b>{use where}</b> }
component Part(p: { n: string }) { provide where = p.n
  <i>{use slot}</i> }
component Frame(p: { children: View }) { provide slot = p.children
  <div><Part n="a" /><Part n="b" /></div> }
export default component App() { <Frame><Made /></Frame> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `ab` | log(made); log(made) |

## Variant: what the view needs is at the place that shows it, or at the provider

```rx
context item: (o: { v: string }) => View
context theme: string
context row: string
component Listbox() { provide row = "r"
  <ul><use.item v="a" /></ul> }
component Root(p: { item: (o: { v: string }) => View; children: View }) { provide item = p.item
  provide theme = "t"
  <div>{p.children}</div> }
export default component App() { <Root>{view item (o) { <li>{use theme}{use row}{o.v}</li> }}<Listbox /></Root> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tra` |  |

## Rejected variants

```rx
-- reject: VIEW_NOT_SHOWN
export context item: View
export default component App() { <b>x</b> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context item: View
component Part() { x = use item
  <i>{x}</i> }
component Frame(p: { children: View }) { provide item = p.children
  <div><Part /></div> }
export default component App() { <Frame>x</Frame> }
```

```rx
-- reject: CONTEXT_NOT_FOUND
context item: (o: { v: string }) => View
context row: string
component Listbox() { <ul><use.item v="a" /></ul> }
component Root(p: { item: (o: { v: string }) => View; children: View }) { provide item = p.item
  <div>{p.children}</div> }
export default component App() { <Root>{view item (o) { <li>{use row}{o.v}</li> }}<Listbox /></Root> }
```

```rx
-- reject: CONTENT_MODEL
context item: (o: { v: string }) => View
component Listbox() { <ul><use.item v="a" /></ul> }
component Root(p: { item: (o: { v: string }) => View; children: View }) { provide item = p.item
  <div>{p.children}</div> }
export default component App() { <Root>{view item (o) { <tr><td>{o.v}</td></tr> }}{portal { <Listbox /> }}</Root> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context item: (o: { v: number }) => View
component Root(p: { item: (o: { v: string }) => View; children: View }) { provide item = p.item
  <div>{p.children}</div> }
export default component App() { <Root>{view item (o) { <li>{o.v}</li> }}x</Root> }
```

```rx
-- reject: UNHANDLED_FAILURE
context item: View
component Part() { <i>{use item}</i> }
component Frame(p: { children: View }) { provide item = p.children
  <div><Part /></div> }
export default component App() { <Frame>{throw "boom"}</Frame> }
```
