# S-generic-2 — a generic component, a generic type

Rules exercised: 07 §2, TY-2, RG-4c, MO-9b, MO-13i.

A component's type parameters and a type alias's are TypeScript's text, as a fn's are (S-generic-1). They are inferred at
the tag from what the component is given; no type argument is written there (`<List<Row> …>` is no tag). What the caller
writes in a view the component shows, `{view (r) { … }}`, is typed by them: a list the library owns, with the caller's
row type kept. A type parameter stands for a value's type, never for a view.

## Modules
```rx
-- module: ./lib.rx
export type Row = { id: number; name: string }
export type ListProps<T> = { items: T[]; children: (r: { item: T }) => View; empty?: View }
export component List<T>(props: ListProps<T>) {
  <ul>{for x in props.items { <li><props.children item={x} /></li> }}{if len(props.items) == 0 { {props.empty} }}</ul>
}
export type Render<T> = (r: { item: T }) => View
export component L<T>(props: { items: T[]; children: Render<T> }) { <ul>{for x in props.items { <li><props.children item={x} /></li> }}</ul> }
export type Slot<C> = { children: C }
export type Boxed<T> = { v: T }
export component Show(props: { b: Boxed<number> }) { <p>{props.b.v.toFixed(1)}</p> }
export type Slots<N> = { n: N; head?: View; children: View }
export component Card(props: Slots<number>) { <section><h2>{props.head}</h2>{props.children}{props.n}</section> }
```

`export type ListProps<T> = { items: T[]; children: (r: { item: T }) => View; empty?: View }`,
`export type Render<T> = (r: { item: T }) => View`,
`export component List<T>(props: { items; empty; children: view { item: T } value(item) }) …`: the parameters are on the printed
rows. A module that names `ListProps<Row>` or `Slots<number>` reads it with each parameter's name replaced by its argument (a
default where none is written), so a prop that is a view there is one (`Slots<number>`'s `children`, `head`).

## Program

```rx
import { List, Row } from "./lib.rx"
export default component App() {
  source rows: Row[] := [{ id: 2, name: "bo" }, { id: 1, name: "al" }]
  <List items={rows} empty={"none"}>{view (r) { <b>{r.item.name}</b> }}</List>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `boal` |
| 1 | handler `rows := [{ id: 3, name: "cy" }]` | `cy` |

## Variant: a Select that owns its list, with the caller's option type in the item's view (the context is the library's: `any`)

```rx
type Opt = { value: string; label: string; disabled?: boolean }
context itemComponent: (props: { item: any }) => View
context select: { options: any[]; value: string; pick: (v: string) => void } = { options: [], value: "", pick: (v) => { } }
component Select<T extends { value: string }>(p: { options: T[]; itemComponent: (props: { item: T }) => View; children: View; onChange?: (o: T) => void }) {
  source value := ""
  action pick(v: string) { value := v }
  provide select = { options: p.options, value: value, pick: pick }
  provide itemComponent = p.itemComponent
  <div>{p.children}</div> }
component Listbox() { s = use select
  <ul>{for o in s.options { <li onClick={() => { s.pick(o.value) }}><use.itemComponent item={o} />{s.value == o.value ? "*" : ""}</li> }}</ul> }
export default component App() { source opts: Opt[] := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana", disabled: true }]
  <Select options={opts}>{view itemComponent (q) { <b>{q.item.label}{q.item.disabled ? "!" : ""}</b> }}<Listbox /></Select> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `AppleBanana!` |

## Variant: a Combobox that keeps the chosen `T` in a source

```rx
context opt: (props: { item: any; active: boolean }) => View
context combo: { shown: any[]; query: string; value: any; type: (q: string) => void; pick: (v: any) => void } = { shown: [], query: "", value: undefined, type: (q) => { }, pick: (v) => { } }
component Combobox<T>(p: { options: T[]; text: (o: T) => string; opt: (props: { item: T; active: boolean }) => View; children: View; onChange?: (o: T) => void }) {
  source query := ""
  source value: T | undefined := undefined
  shown = filter(p.options, (o) => query == "" || p.text(o).includes(query))
  action type(q: string) { query := q }
  action pick(v: T) { value := () => v
    query := p.text(v) }
  provide combo = { shown: shown, query: query, value: value, type: type, pick: pick }
  provide opt = p.opt
  <div>{p.children}</div> }
component Input() { c = use combo
  <input value={c.query} onInput={(e) => { c.type(e.target.value) }} /> }
component Listbox() { c = use combo
  <ul>{for o in c.shown { <li onClick={() => { c.pick(o) }}><use.opt item={o} active={c.value == o} /></li> }}</ul> }
export default component App() { source people := [{ id: 1, name: "Ann" }, { id: 2, name: "Bob" }]
  <Combobox options={people} text={(o) => o.name}>{view opt (q) { <b>{q.item.name}#{q.item.id}{q.active ? "*" : ""}</b> }}<Input /><Listbox /></Combobox> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `Ann#1Bob#2` |

## Variant: a table with columns keyed by the row's type

```rx
type Col<T> = { key: keyof T; title: string }
component Grid<T extends { id: number }>(props: { rows: T[]; cols: Col<T>[]; cell: (c: { row: T; col: Col<T> }) => View }) {
  <table><thead><tr>{for c in props.cols { <th>{c.title}</th> }}</tr></thead>
  <tbody>{for r in props.rows { <tr>{for c in props.cols { <td><props.cell row={r} col={c} /></td> }}</tr> }}</tbody></table> }
export default component App() { source rows := [{ id: 1, name: "al", age: 3 }]
  <Grid rows={rows} cols={[{ key: "name", title: "N" }, { key: "age", title: "A" }]}>{view cell (c) { <b>{str(c.row[c.col.key])}</b> }}</Grid> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `NAal3` |

## Variant: a generic component that forwards to another

```rx
component L<T>(props: { items: T[]; children: (r: { item: T }) => View }) { <ul>{for x in props.items { <li><props.children item={x} /></li> }}</ul> }
component Wrap<U>(props: { xs: U[]; children: (r: { item: U }) => View }) { <div><L items={props.xs}>{view (r) { <props.children item={r.item} /> }}</L></div> }
export default component App() { <Wrap xs={[{ n: 1 }]}>{view (r) { {r.item.n} }}</Wrap> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `1` |

## Variant: children that are a view with a parameter, or plain content

```rx
type Render<T> = (r: { item: T }) => View
component T<V>(props: { v: V; children?: View | Render<V> }) { <p><props.children item={props.v} /></p> }
export default component App() { <T v={2}>{view (s) { {s.item + 1} }}</T><T v={"a"}>plain</T> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `3plain` |

## Variant: a context that holds a view, typed by a generic alias

```rx
type Render<T> = (r: { item: T }) => View
type Opt = { label: string }
context cell: Render<any>
component Root<T>(props: { items: T[]; cell: Render<T>; children: View }) { provide cell = props.cell
  provide list = props.items
  <section>{props.children}</section> }
context list: any[] = []
component Body() { xs = use list
  <ul>{for x in xs { <li><use.cell item={x} /></li> }}</ul> }
export default component App() { source o: Opt[] := [{ label: "a" }]
  <Root items={o}>{view cell (r) { <b>{r.item.label}</b> }}<Body /></Root> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a` |

## Variant: a type parameter named as a type of the module is the parameter there

```rx
type Item = { children: View }
component L<Item>(props: { x: Item; children: View }) { y = props.x
  <p>{str(y)}{props.children}</p> }
export default component App() { <L x={1}><b>k</b></L> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `1k` |

## Accepted variants

```rx
-- accept
type Slot<A, C = View> = { children: C; n: A }
component Box(props: Slot<number>) { <p>{props.children}{props.n}</p> }
export default component App() { <Box n={1}><b>x</b></Box> }
```

```rx
-- accept
type Pair<T> = { T: T; label: string }
component Show(props: { p: Pair<number> }) { <p>{props.p.T.toFixed(1)}{props.p.label}</p> }
export default component App() { <Show p={{ T: 1, label: "x" }} /> }
```

```rx
-- accept
interface Props<T> { items: T[]; children: (r: { item: T }) => View }
component L<T>(props: Props<T>) { <p>{for x in props.items { <props.children item={x} /> }}</p> }
export default component App() { <L items={["a", "b"]}>{view (r) { {r.item.toUpperCase()} }}</L> }
```

```rx
-- accept
component Tabs<const T extends readonly string[]>(props: { ids: T; children: (r: { id: T[number] }) => View }) { <nav>{for x in props.ids { <props.children id={x} /> }}</nav> }
export default component App() { <Tabs ids={["a", "b"]}>{view (r) { {r.id == "a" ? "A" : "B"} }}</Tabs> }
```

```rx
-- accept
component Two<T>({ a, b }: { a: T; b: T }) { <p>{str(a)}{str(b)}</p> }
export default component App() { <Two a={1} b={2} /> }
```

```rx
-- accept
component Nil<T>() { <p>n</p> }
export default component App() { <Nil /> }
```

```rx
-- accept
import { Card, Slots } from "./lib.rx"
component W(props: Slots<number>) { <Card n={props.n} head={props.head}>{props.children}</Card> }
export default component App() { <W n={1} head={"h"}><b>c</b></W> }
```

```rx
-- accept
import { L, Render } from "./lib.rx"
component W<T>(props: { xs: T[]; children: Render<T> }) { <div><L items={props.xs}>{view (r) { <props.children item={r.item} /> }}</L></div> }
export default component App() { <W xs={[{ n: 1 }]}>{view (r) { {r.item.n} }}</W> }
```

```rx
-- accept
component L<T>(props: { items: T[]; row?: (r: { item: T }) => View; children?: View }) {
  <ul>{for x in props.items { <li>{if props.row { <props.row item={x} /> } else { {str(x)} }}</li> }}{props.children}</ul> }
export default component App() { <L items={[1]} /><L items={["a"]}>{view row (r) { {r.item.length} }}</L> }
```

```rx
-- accept
component Card<T>(props: { v: T; title?: View; children: (r: { v: T }) => View }) {
  <section>{if props.title { <h2>{props.title}</h2> }}<props.children v={props.v} /></section> }
export default component App() { source on := false
  <Card v={1} title={on ? "T" : undefined}>{view (r) { {r.v} }}</Card> }
```

## Rejected variants

A source of a type parameter written with a value of it: `T` may be a function, and a write applies a function (W-6),
so the type pass refuses it with what to write, `value := () => v`, which stores `v` for every `T` (2026-11-26: this was
taken for one release, and a caller's function was then applied, not stored).

```rx
-- types: TS2345
component Keep<T>(props: { v: T; go: boolean }) {
  source value: T | undefined := undefined
  effect (props.go) { if ($0) { value := props.v } }
  <b>{value == undefined ? "none" : "set"}</b>
}
export default component App() {
  source go := false
  <Keep v={(x: number) => 7} go={go} />
}
```

The caller's row type reaches the view the component shows.

```rx
-- types: TS2339
import { List, Row } from "./lib.rx"
export default component App() {
  source rows: Row[] := [{ id: 1, name: "a" }]
  <List items={rows}>{view (r) { <b>{r.item.nmae}</b> }}</List>
}
```

```rx
-- types: TS2551
type Opt = { value: string; label: string; disabled?: boolean }
context itemComponent: (props: { item: any }) => View
context select: { options: any[]; value: string; pick: (v: string) => void } = { options: [], value: "", pick: (v) => { } }
component Select<T extends { value: string }>(p: { options: T[]; itemComponent: (props: { item: T }) => View; children: View; onChange?: (o: T) => void }) {
  source value := ""
  action pick(v: string) { value := v }
  provide select = { options: p.options, value: value, pick: pick }
  provide itemComponent = p.itemComponent
  <div>{p.children}</div> }
component Listbox() { s = use select
  <ul>{for o in s.options { <li onClick={() => { s.pick(o.value) }}><use.itemComponent item={o} />{s.value == o.value ? "*" : ""}</li> }}</ul> }
export default component App() { source opts: Opt[] := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana", disabled: true }]
  <Select options={opts}>{view itemComponent (q) { <b>{q.item.lable}{q.item.disabled ? "!" : ""}</b> }}<Listbox /></Select> }
```

```rx
-- types: TS2551
context opt: (props: { item: any; active: boolean }) => View
context combo: { shown: any[]; query: string; value: any; type: (q: string) => void; pick: (v: any) => void } = { shown: [], query: "", value: undefined, type: (q) => { }, pick: (v) => { } }
component Combobox<T>(p: { options: T[]; text: (o: T) => string; opt: (props: { item: T; active: boolean }) => View; children: View; onChange?: (o: T) => void }) {
  source query := ""
  source value: T | undefined := undefined
  shown = filter(p.options, (o) => query == "" || p.text(o).includes(query))
  action type(q: string) { query := q }
  action pick(v: T) { value := () => v
    query := p.text(v) }
  provide combo = { shown: shown, query: query, value: value, type: type, pick: pick }
  provide opt = p.opt
  <div>{p.children}</div> }
component Input() { c = use combo
  <input value={c.query} onInput={(e) => { c.type(e.target.value) }} /> }
component Listbox() { c = use combo
  <ul>{for o in c.shown { <li onClick={() => { c.pick(o) }}><use.opt item={o} active={c.value == o} /></li> }}</ul> }
export default component App() { source people := [{ id: 1, name: "Ann" }, { id: 2, name: "Bob" }]
  <Combobox options={people} text={(o) => o.name}>{view opt (q) { <b>{q.item.nam}#{q.item.id}{q.active ? "*" : ""}</b> }}<Input /><Listbox /></Combobox> }
```

A constraint is held at the tag.

```rx
-- types: TS2353
component Tb<T extends { id: number }>(props: { rows: T[] }) { <p>{for x in props.rows { {x.id} }}</p> }
export default component App() { <Tb rows={[{ name: "a" }]} /> }
```

```rx
-- types: TS2322
component Eq<T extends string | number>(props: { a: T[]; pick: (x: T) => void }) { <p onClick={() => { props.pick(props.a[0]) }}>{len(props.a)}</p> }
export default component App() { source s := ""
  action set(x: string) { s := x }
  <Eq a={[1, 2]} pick={set} /> }
```

```rx
-- types: TS2322
type Col<T> = { key: keyof T; title: string }
component Grid<T extends { id: number }>(props: { rows: T[]; cols: Col<T>[]; cell: (c: { row: T; col: Col<T> }) => View }) {
  <table><thead><tr>{for c in props.cols { <th>{c.title}</th> }}</tr></thead>
  <tbody>{for r in props.rows { <tr>{for c in props.cols { <td><props.cell row={r} col={c} /></td> }}</tr> }}</tbody></table> }
export default component App() { source rows := [{ id: 1, name: "al", age: 3 }]
  <Grid rows={rows} cols={[{ key: "name", title: "N" }, { key: "aeg", title: "A" }]}>{view cell (c) { <b>{str(c.row[c.col.key])}</b> }}</Grid> }
```

```rx
-- types: TS2367
component Tabs<const T extends readonly string[]>(props: { ids: T; children: (r: { id: T[number] }) => View }) { <nav>{for x in props.ids { <props.children id={x} /> }}</nav> }
export default component App() { <Tabs ids={["a", "b"]}>{view (r) { {r.id == "c" ? "A" : "B"} }}</Tabs> }
```

```rx
-- types: TS2322
import { Show, Boxed } from "./lib.rx"
export default component App() { b: Boxed<number> = { v: "2" }
  <Show b={b} /> }
```

```rx
-- types: TS2339
type Render<T> = (r: { item: T }) => View
component L<T>(props: { items: T[]; children: Render<T> }) { <ul>{for x in props.items { <li><props.children item={x} /></li> }}</ul> }
export default component App() { <L items={[1, 2]}>{view (r) { {r.item.toUpperCase()} }}</L> }
```

A type parameter stands for a value: a view is not given on to it.

```rx
-- reject: VIEW_NOT_SHOWN
component Val<T>(props: { v: T }) { x = props.v
  <p>{str(x)}</p> }
component W(props: { children: View }) { <Val v={props.children} /> }
export default component App() { <W><b>k</b></W> }
```

`Slot<View>`: the parameter's argument is read, so `children` is a view, and only shown.

```rx
-- reject: VIEW_NOT_SHOWN
type Slot<C> = { children: C; n: number }
component Box(props: Slot<View>) { x = props.children
  y = [x]
  <p>{len(y)}</p> }
export default component App() { <Box n={1}><b>x</b></Box> }
```

```rx
-- reject: VIEW_NOT_SHOWN
type Slot<A, C = View> = { children: C; n: A }
component Box(props: Slot<number>) { effect (props.children) { log("x") }
  <p>{props.n}</p> }
export default component App() { <Box n={1}><b>x</b></Box> }
```

```rx
-- reject: VIEW_NOT_SHOWN
import { Slot } from "./lib.rx"
component Box(props: Slot<View>) { y = [props.children]
  <p>{len(y)}</p> }
export default component App() { <Box><b>x</b></Box> }
```

```rx
-- reject: VIEW_NOT_SHOWN
import { Slots } from "./lib.rx"
component W(props: Slots<number>) { x = props.head
  y = { h: x }
  <p>{str(y)}</p> }
export default component App() { <W n={1} head={"h"}><b>c</b></W> }
```

```rx
-- reject: VIEW_NOT_SHOWN
type Item = { children: View }
component L<Item>(props: { x: Item; children: View }) { y = [props.children]
  <p>{len(y)}</p> }
export default component App() { <L x={1}><b>k</b></L> }
```

A generic alias that is a view's type is one.

```rx
-- reject: VIEW_FN_MISPLACED
type Render<T> = (r: { item: T }) => View
component L<T>(props: { items: T[]; children: Render<T> }) { f = props.children
  <ul>{for x in props.items { <li>{f({ item: x })}<props.children item={x} /></li> }}</ul> }
export default component App() { <L items={[1, 2]}>{view (r) { {r.item} }}</L> }
```

```rx
-- reject: VIEW_NOT_SHOWN
type Render<T> = (r: { item: T }) => View
type Opt = { label: string }
context cell: Render<any>
component Root<T>(props: { items: T[]; cell: Render<T>; children: View }) { provide cell = props.cell
  provide list = props.items
  <section>{props.children}</section> }
context list: any[] = []
component Body() { xs = use list
  c = use cell
  <ul>{for x in xs { <li>{c({ item: x })}</li> }}</ul> }
export default component App() { source o: Opt[] := [{ label: "a" }]
  <Root items={o}>{view cell (r) { <b>{r.item.label}</b> }}<Body /></Root> }
```

```rx
-- reject: VIEW_NOT_SHOWN
type Render<T> = (r: { item: T }) => View
type Opt = { label: string }
export context cell: Render<any>
component Root<T>(props: { items: T[]; cell: Render<T>; children: View }) { provide cell = props.cell
  provide list = props.items
  <section>{props.children}</section> }
context list: any[] = []
component Body() { xs = use list
  <ul>{for x in xs { <li><use.cell item={x} /></li> }}</ul> }
export default component App() { source o: Opt[] := [{ label: "a" }]
  <Root items={o}>{view cell (r) { <b>{r.item.label}</b> }}<Body /></Root> }
```

No type argument at a tag.

```rx
-- reject: PARSE
component Val<T>(props: { v: T }) { <p>{str(props.v)}</p> }
export default component App() { <Val<number> v={1} /> }
```

```rx
-- reject: PARSE
component Two<T(props: { a: T }) { <p>x</p> }
export default component App() { <Two a={1} /> }
```

Children are content, a view: they are not declared a type parameter.

```rx
-- reject: VIEW_NOT_SHOWN
component Val<T>(props: { children: T }) { x = props.children
  <p>{str(x)}</p> }
export default component App() { <Val><b>k</b></Val> }
```
