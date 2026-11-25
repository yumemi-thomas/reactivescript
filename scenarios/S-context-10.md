# S-context-10 — a context that holds a view: a choice of views, and a choice that is asked

Rules: RG-4c, SV-7d.

What the third independent review found refused and right (2026-11-26). A context that holds a view, given a choice
of the component's views (`c ? p.a : p.b`, `p.a ?? p.b`, `p.a || p.b`, with `undefined` for none), holds views and no
text: each is placed where the context is shown, so rows may go to a `<tbody>`. And a choice or a default of views is
asked as one view is: `if p.l ?? p.r`, `if c ? p.l : p.r`.

The program: a table whose rows are one of two views its root was given.

## Program

```rx
context body: View
component Part() { <table><tbody>{use body}</tbody></table> }
component Rt(p: { b?: View; c?: View; z: boolean; children?: View }) { provide body = p.z ? p.b : p.c
  <div>{p.children}</div> }
component Give(p: { children: View; z: boolean }) { <Rt z={p.z} b={p.children} c={p.children}><Part /></Rt> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Give z={n != "B"}><tr><td>{n}</td></tr></Give> }
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tA` |  |
| 1 | handler `n := "B"` | `tB` |  |

## Variant: one view or none

```rx
context body: View
component Part() { <table><tbody>{use body}</tbody></table> }
component Rt(p: { b?: View; z: boolean; children?: View }) { provide body = p.z ? p.b : undefined
  <div>{p.children}</div> }
component Give(p: { children: View; z: boolean }) { <Rt z={p.z} b={p.children}><Part /></Rt> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Give z={n != "B"}><tr><td>{n}</td></tr></Give> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tA` |  |
| 1 | handler `n := "B"` | `t` |  |

## Variant: the first that was given

```rx
context body: View
component Part() { <table><tbody>{use body}</tbody></table> }
component Rt(p: { b?: View; c?: View; children?: View }) { provide body = p.b ?? p.c
  <div>{p.children}</div> }
component Give(p: { children: View }) { <Rt c={p.children}><Part /></Rt> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Give><tr><td>{n}</td></tr></Give> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tA` |  |
| 1 | handler `n := "B"` | `tB` |  |

## Variant: a default of views is asked as a view is

```rx
component W(p: { l?: View; r?: View }) { {if p.l ?? p.r { <i>Y</i> } else { <i>N</i> }}{p.l ?? p.r ?? "D"} }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><W r={n == "B" ? "R" : undefined} /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tND` |  |
| 1 | handler `n := "B"` | `tYR` |  |

## Variant: a choice of views is asked as a view is

```rx
component W(p: { l?: View; r?: View; z: boolean }) { {if p.z ? p.l : p.r { <i>Y</i> } else { <i>N</i> }} }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><W z={n == "A"} r="R" /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tN` |  |
| 1 | handler `n := "B"` | `tY` |  |

## Variant: an argument is its value; a value written as content is its text

`!= undefined` asks that alone (`null` is not `undefined`); `??` takes both for nothing. Content that is a value is
shown as its text and was given, but for the empty text.

```rx
component A(p: { l?: View }) { <b>{p.l != undefined ? "Y" : "N"}{if p.l { <i>y</i> } else { <i>n</i> }}[{p.l ?? "D"}]</b> }
component C(p: { children?: View }) { <b>{if p.children { <i>y</i> } else { <i>n</i> }}[{p.children}]</b> }
export default component App() { <A l={undefined} /><A l={null} /><A l={0} /><A l={""} /><C>{undefined}</C><C>{0}</C><C>{""}</C><C><>{""}</></C><C></C> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `Nn[D]Yn[D]Yn[0]Yn[]y[undefined]y[0]n[]y[]n[]` |  |

## Variant: a view the root may not have been given: the context then holds none, and nothing is shown

```rx
context item: (o: { v: string }) => View
component Part() { <li><use.item v="a" /></li> }
component Root(p: { item?: (o: { v: string }) => View; children?: View }) { provide item = p.item
  <ul>{p.children}</ul> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Root><Part /></Root><Root>{view item (o) { <b>{o.v}{n}</b> }}<Part /></Root> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `taA` |  |
| 1 | handler `n := "B"` | `taB` |  |

## Variant: a tree: the type of the view's parameter names itself

```rx
type N = { v: string; kids: N[] }
context node: (x: { n: N }) => View
component Tree(p: { node: (x: { n: N }) => View; root: N }) { provide node = p.node
  <ul><use.node n={p.root} /></ul> }
component Kids(p: { of: N }) { {for k in p.of.kids { <use.node n={k} /> }} }
export default component App() { source n := "A"
  t: N = { v: n, kids: [{ v: "x", kids: [{ v: "y", kids: [] }] }, { v: "z", kids: [] }] }
  <button onClick={() => { n := "B" }}>t</button><Tree root={t}>{view node (x) { <li>{x.n.v}<ul><Kids of={x.n} /></ul></li> }}</Tree> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tAxyz` |  |
| 1 | handler `n := "B"` | `tBxyz` |  |

## Variant: the same type written another way, and a view that asks for less than the context gives

```rx
context item: ((o: { v: string; w: Array<string> }) => View)
context wide: (o: { v: string; w: number }) => View
component Part() { <li><use.item v="a" w={["b"]} /><use.wide v="c" w={1} /></li> }
component Root(p: { item: (o: { w: string[]; v: string }) => View; wide: (o: { v: string }) => View; children?: View }) { provide item = p.item
  provide wide = p.wide
  <ul>{p.children}</ul> }
export default component App() { <Root>{view item (o) { <b>{o.v}{o.w[0]}</b> }}{view wide (o) { <i>{o.v}</i> }}<Part /></Root> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `abc` |  |

## Rejected variants

Whether a prop's type is the context's is the type pass's to say. A view that asks for more than the context gives:

```rx
-- types: TS2345
context item: (o: { v: string }) => View
component Part() { <li><use.item v="a" /></li> }
component Root(p: { item: (o: { v: string; w: number }) => View; children?: View }) { provide item = p.item
  <ul>{p.children}</ul> }
export default component App() { <Root>{view item (o) { <b>{o.v}{o.w}</b> }}<Part /></Root> }
```

Shown without an argument its type asks for:

```rx
-- types: TS2322
context item: (o: { v: string }) => View
component Part() { <li><use.item /></li> }
component Root(p: { item: (o: { v: string }) => View; children?: View }) { provide item = p.item
  <ul>{p.children}</ul> }
export default component App() { <Root>{view item (o) { <b>{o.v}</b> }}<Part /></Root> }
```

A flag before the view: where the flag is false the context holds `false`, which is shown as text, and text is not a
row.

```rx
-- reject: CONTENT_MODEL
context body: View
component Part() { <table><tbody>{use body}</tbody></table> }
component Rt(p: { b?: View; z: boolean; children?: View }) { provide body = p.z && p.b
  <div>{p.children}</div> }
component Give(p: { children: View; z: boolean }) { <Rt z={p.z} b={p.children}><Part /></Rt> }
export default component App() { <Give z={true}><tr><td>a</td></tr></Give> }
```

`null` is a value too, and is shown:

```rx
-- reject: CONTENT_MODEL
context body: View
component Part() { <table><tbody>{use body}</tbody></table> }
component Rt(p: { b?: View; z: boolean; children?: View }) { provide body = p.z ? p.b : null
  <div>{p.children}</div> }
component Give(p: { children: View; z: boolean }) { <Rt z={p.z} b={p.children}><Part /></Rt> }
export default component App() { <Give z={true}><tr><td>a</td></tr></Give> }
```
