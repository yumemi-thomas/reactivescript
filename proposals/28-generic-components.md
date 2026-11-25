# 28 — Generic components and generic types

[25](25-views.md) ends on "a *generic* row needs type parameters on a component; [20](20-generic-fns.md) has them on fns alone". This is that step: a library-owned list (a table, a select, a combobox) whose caller keeps its row type in the view it writes. Built on `rx-best` (local, not published).

<!-- types branch=TS2339 upstream=PARSE -->
```rx
component List<T>(props: { items: T[]; children: (r: { item: T }) => View }) {
  <ul>{for x in props.items { <li><props.children item={x} /></li> }}</ul>
}
export default component App() {
  source rows := [{ id: 1, name: "al" }]
  <List items={rows}>{view (r) { <b>{r.item.nmae}</b> }}</List>
}
```

## Proposal

1. `component List<T>(…)`, `type Item<T> = …`, `interface Props<T> { … }`: TypeScript's text after the name, with constraints, defaults and `const`, as on a fn. The compiled JavaScript has none of it.
2. A tag infers them from what the component is given. **No type argument is written at a tag** (`<List<Row> …>` is no tag), as none is at a call.
3. The checkers read one thing. A generic alias applied, `Slot<View>`, `Render<Row>`, is read with each parameter's name replaced by its argument (a default where none is written): a prop that is a view there is one, and RG-4c holds it. An alias that binds a parameter's name again (`infer T`, a mapped type's key, a generic function type) is not read, as a type of JavaScript is not.
4. **A type parameter stands for a value's type, never for a view.** A view is not given on to a prop declared `T`; children are not declared `T`; a named view block has no prop `T` to go to. So a generic component cannot be handed a view that it then reads as a value.
5. Inside a generic declaration a parameter's name is no type of the module (`component L<Item>` beside `type Item`).
6. The printed signature holds them: `export component List<T>(props: { items; children: view { item: T } value(item) })`, `export type Item<T> = { v: T }`, and an exported type that is a view's type is printed (`export type Render<T> = (r: { item: T }) => View`), so a module checked against the signature reads what one checked against the source reads.

<!-- frames branch=pass upstream=fail -->
```rx
type Opt = { value: string; label: string }
context itemComponent: (props: { item: any }) => View
context select: { options: any[]; value: string; pick: (v: string) => void } = { options: [], value: "", pick: (v) => { } }
component Select<T extends { value: string }>(p: { options: T[]; itemComponent: (props: { item: T }) => View; children: View }) {
  source value := ""
  action pick(v: string) { value := v }
  provide select = { options: p.options, value: value, pick: pick }
  provide itemComponent = p.itemComponent
  <div>{p.children}</div> }
component Listbox() { s = use select
  <ul>{for o in s.options { <li onClick={() => { s.pick(o.value) }}><use.itemComponent item={o} />{s.value == o.value ? "*" : ""}</li> }}</ul> }
export default component App() { source opts: Opt[] := [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }]
  <Select options={opts}>{view itemComponent (q) { <b>{q.item.label}</b> }}<Listbox /></Select> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `AppleBanana` |

**A context is the library's, and is typed `any` there.** A context is declared by the module, outside any component, so it has no `T`. The root's props carry `T`, and the caller's view is typed by them; inside the library the option is `any` between the root and the part that shows it. Kobalte's own context is typed so.

A view given on to a type parameter:

<!-- check branch=VIEW_NOT_SHOWN upstream=PARSE -->
```rx
component Val<T>(props: { v: T }) { x = props.v
  <p>{str(x)}</p> }
component W(props: { children: View }) { <Val v={props.children} /> }
export default component App() { <W><b>k</b></W> }
```

A parameter's argument is read:

<!-- check branch=VIEW_NOT_SHOWN upstream=PARSE -->
```rx
type Slot<C> = { children: C; n: number }
component Box(props: Slot<View>) { x = props.children
  y = [x]
  <p>{len(y)}</p> }
export default component App() { <Box n={1}><b>x</b></Box> }
```

<!-- check branch=PARSE upstream=PARSE -->
```rx
component Val<T>(props: { v: T }) { <p>{str(props.v)}</p> }
export default component App() { <Val<number> v={1} /> }
```

**For TSX.** `rx-lib` writes what the projection has: `export declare function List<T extends { id: number }>(props: { items: T[]; children: Render<T>; empty?: View }): JSX.Element`. A TSX caller writes `<List items={rows}>{(r) => <b>{r.item.name}</b>}</List>`, and `r.item.nmae` is `TS2339` there too (run by hand on a built package; no test holds it yet).

## One change to the type pass

A source of a type parameter's type could not be written with a `T` (`source value: T | undefined`, `value := v`: `TS2345`). The write's type refuses a function, because a function is applied to what the source held (W-6), and TypeScript cannot decide that for an unknown `T`. It is read by a tuple's length now, as `eq` is since 20: every verdict on a known type is the same, and a `T` is written with itself. If the caller's `T` is a function, the write applies it, in every runner, as Solid's setter does. That is the one thing here that is weaker than before.

## Evidence

| | |
| --- | --- |
| programs written for this (`mkg.py`: 7 library shapes × 8 callers × in the module or imported, and 60 by hand for the edges) | 170: 119 accepted, 36 that the type pass alone refuses, 15 refused by both checkers, each as its name says |
| the interpreter, the oracle and both emitters on the 119 | alike on all |
| served and hydrated, both emitters | 118 of 118 (one has a `\|` in a frame, which the harness cannot hold) |
| both checkers; lowered; projected | alike on all 170 |
| shapes written and run (S-generic-2) | a list, a table with columns keyed by `keyof T`, a Select and a Combobox that own their list with the caller's option type, a generic component that forwards to another, children that are a view with a parameter or plain |

## Cost

| | |
| --- | --- |
| rules | a paragraph of 07 §2; a row of TY-2; a row of 09's table |
| code | about 290 lines added in the crate (a unit's 40 among them) and 110 in `ref/`, 3 of grammar; nothing in the emitters' output or the runtimes |
| a reader learns | nothing new: `<T>` where TypeScript has it |

## Against

- A context cannot carry `T`: between a generic root and its parts the row is `any` inside the library.
- A view cannot reach a prop declared `T` through a **module boundary's spread or forward** any more than through any prop whose type the importer cannot read: the printed signature has no word for "this prop takes a value" ([26](26-children-are-shown.md), the same limit).
- Substitution is of text. It is refused where a name is bound again; a shape it misreads would be read as "not a view", which is the answer for a type that is not read.
