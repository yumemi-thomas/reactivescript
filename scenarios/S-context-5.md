# S-context-5 — a view is only shown: what is refused, and what is written instead

Rules: RG-4c, RG-4b, 99.

A prop typed `View` (the children, or one of another name) is shown, given on, named by a projection or asked for
(S-context-4). Read as a value it is `VIEW_NOT_SHOWN`: kept by `peek` or a source, carried by a context, read by an effect
or a handler, answered by a closure, held in a record or a list, given to a fn. Each has a form that is accepted, below;
the diagnostic says which. One has none that keeps the caller's program as it is: a view carried by a context to a part the
caller places (Kobalte's `Select`, `Combobox`, `Pagination`); the two forms that run are the last two of the list.

## Program

```rx
context c: string = "out"
component Z(q: { part: View }) { provide c = "z"
  <i>{q.part}</i> }
component Carry(p: { children: View }) { <Z part={p.children} /> }
export default component App() { <Carry>{use c}</Carry> }
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `z` |  |

## Variant: for a closure, or a view shown at several places: an argument typed View

```rx
component Row(q: { part: View }) { <li>{q.part}</li> }
component List(p: { children: View }) { <ul><Row part={p.children} /><Row part={p.children} /></ul> }
export default component App() { source n := 1
  <List><b>{n}</b></List> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `11` |  |
| 1 | handler `n := 2` | `22` |  |

## Variant: for a record of views: a view of each name

```rx
component Card(p: { header: () => View; footer: () => View; children: View }) { <div><h1><p.header /></h1>{p.children}<small><p.footer /></small></div> }
export default component App() { source n := 1
  <Card>{view header () { <b>head{n}</b> }}{view footer () { <i>foot</i> }}body</Card> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `head1bodyfoot` |  |
| 1 | handler `n := 2` | `head2bodyfoot` |  |

## Variant: for a list: one after the other

```rx
component Bang(p: { children: View }) { <i>{p.children}!</i> }
export default component App() { <Bang><b>a</b></Bang> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `a!` |  |

## Variant: for an effect: whether one was given

```rx
component Watch(p: { children?: View }) {
  effect (p.children != undefined) { log($0 ? "some" : "none") }
  <i>{p.children}</i>
}
export default component App() { <Watch>a</Watch><Watch /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `a` | log(some); log(none) |

## Variant: for a handler: a source that says when

```rx
component Reveal(p: { children: View }) {
  source open := false
  <button onClick={() => { open := true }}>show</button>{if open { <i>{p.children}</i> }}
}
component Made() { effect () { log("made") }
  <b>x</b> }
export default component App() { <Reveal><Made /></Reveal> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `show` |  |
| 1 | handler `open := true` | `showx` | log(made) |

## Variant: for a snapshot: shown

```rx
context c: string = "out"
component Once(p: { children: View }) { provide c = "in"
  <i>{p.children}</i> }
export default component App() { <Once>{use c}</Once> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `in` |  |

## Variant: a list whose rows the caller draws: the root shows it

```rx
context sel: { value: string }
component Select(props: { options: string[]; item: (s: { value: string; selected: boolean }) => View; children: View }) {
  source value := "a"
  provide sel = { value: value }
  <div>{props.children}<ul>{for o in props.options { <li><props.item value={o} selected={o == value} /></li> }}</ul></div>
}
component Value() { <b>{(use sel).value}</b> }
export default component App() {
  <Select options={["a", "b"]}>{view item (r) { <i>{r.value}{r.selected ? "*" : ""}</i> }}<Value /></Select>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `aa*b` |  |
| 1 | handler `value := "b"` | `bab*` |  |

## Variant: … or the part that shows the rows is given the view

```rx
context sel: { value: string; options: string[] }
component Select(props: { options: string[]; children: View }) {
  source value := "a"
  provide sel = { value: value, options: props.options }
  <div>{props.children}</div>
}
component Listbox(props: { children: (s: { value: string; selected: boolean }) => View }) {
  s = use sel
  <ul>{for o in s.options { <li><props.children value={o} selected={o == s.value} /></li> }}</ul>
}
component Value() { <b>{(use sel).value}</b> }
export default component App() {
  <Select options={["a", "b"]}><Value /><Listbox>{view (r) { <i>{r.value}{r.selected ? "*" : ""}</i> }}</Listbox></Select>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `aa*b` |  |
| 1 | handler `value := "b"` | `bab*` |  |

## Variant: a function shown whatever the answer, plain content only on a match (TanStack MatchRoute): two props

Neither is made to know which was given, and plain content that does not match is not made at all.

```rx
component MatchRoute(props: { to: string; at: string; render?: (s: { match: boolean }) => View; children?: View }) {
  hit = props.to == props.at
  {if props.render { <props.render match={hit} /> } else { {if hit { {props.children} }} }}
}
component Made() { effect () { log("made") }
  <b>here</b> }
export default component App() {
  source at := "/a"
  <MatchRoute to="/a" at={at}><Made /></MatchRoute><MatchRoute to="/b" at={at}><Made /></MatchRoute>
  <MatchRoute to="/b" at={at}>{view render (s) { <i>{s.match ? "on" : "off"}</i> }}</MatchRoute>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `hereoff` | log(made) |
| 1 | handler `at := "/b"` | `hereon` | log(made) |

## Rejected variants

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { source x := peek(p.children)
  <i>{x}</i> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { source x := peek([p.children, p.children])
  <i>{x[0]}{x[1]}</i> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { source x := p.children
  <i>{x}</i> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { provide k = p.children
  <Z /> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { effect (p.children) { log("e") }
  <b>-</b> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { source s := ""
  <b onClick={() => { s := str(p.children) }}>{s}</b> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { f = () => p.children
  <i>{f()}</i> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { r = { v: p.children }
  <i>{r.v}</i> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { <i>{[p.children, "!"]}</i> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { <i>{str(p.children)}</i> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View; other: View }) { <i>{p.children == p.other ? "same" : "not"}</i> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children: View }) { <i title={p.children}>x</i> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
fn first(x: any) => x
component P(p: { children: View }) { q = first(p)
  <i>{q.n}</i> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
context k: any
component Z() { <i>{use k}</i> }
component P(p: { children?: View; label: View }) { n = [p.label]
  <i>{n}</i> }
export default component App() { <P>x</P> }
```
