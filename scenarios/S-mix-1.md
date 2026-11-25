# S-mix-1 — the parts together

Rules: 07 §2, E-9a, RG-4c, RG-7b, AC-1h, MO-9b.

One program each for parts that were made apart and meet here: a generic fn and a fn with an optional parameter, a view
with a parameter, a view asked for, a context that holds a view (with a parameter, optional, a choice of views in a
table), a provision given from what is above it, a handler that mints an id for an action that waits (AC-1h), across a
module's printed signature and in one module. They are a few of 516 programs that mix them all ways, every one alike in
the interpreter, the oracle, both emitters, served and hydrated, both checkers and the type pass (rx-best, 2026-11-26).

The program: a list whose item's view is carried by a context of a module, shown with what a generic fn with an
optional parameter answers, beside a callback prop that mints an id.

## Modules

```rx
-- module: ./lib.rx
export fn orElse<T>(a: T | undefined, b?: T): T | undefined => a ?? b
context item: (o: { v: string }) => View
export component Root(p: { item: (o: { v: string }) => View; children?: View }) { provide item = p.item
  <ul>{p.children}</ul> }
export component Part(p: { v: string }) { <li><use.item v={p.v} /></li> }
```

## Program

```rx
import { orElse, Root, Part } from "./lib.rx"
component Btn(p: { onGo: () => void }) { <button onClick={() => { p.onGo() }}>+</button> }
export default component App() { source n := "A"
  source seq := 0
  source cards := ""
  action add(id: number) {
    let r = await fetch("add") catch (e) => ""
    cards := v => v + "/" + str(id)
  }
  <button onClick={() => { n := "B" }}>t</button><Root>{view item (o) { <b>{o.v}/{(orElse(n == "A" ? undefined : n, "u") ?? "none")}</b> }}<Part v="x" /><Part v={(orElse(n == "A" ? undefined : n, "u") ?? "none")} /></Root><Btn onGo={() => { let k = latest seq + 1; seq := k; add(k) }} />{cards} }
```

## Frames

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `tx/uu/u+` |
| 1 | handler `n := "B"` | `tx/BB/B+` |

## Variant: a provision given from what is above it, twice, with a fn's optional argument

```rx
fn tag(s: string, mark?: string): string => s + (mark ?? "")
context c: string = "-"
component P(p: { v: string; children?: View }) { provide c = (use c) + p.v
  <b>{p.children}</b> }
component Leaf() { <i>{use c}</i> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><P v={tag(n, "!")}><P v="2"><Leaf /></P><Leaf /></P><Leaf /> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `t-A!2-A!-` |
| 1 | handler `n := "B"` | `t-B!2-B!-` |

## Variant: a view the root may not have been given, and a generic fn over a record's key

```rx
fn pluck<T, K extends keyof T>(xs: T[], k: K): T[K][] => map(xs, (x) => x[k])
context item: (o: { v: string }) => View
component Root(p: { item?: (o: { v: string }) => View; children?: View }) { provide item = p.item
  <ul>{p.children}</ul> }
component Part(p: { v: string }) { <li>[<use.item v={p.v} />]</li> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Root><Part v={pluck([{ v: n }], "v").join("")} /></Root><Root>{view item (o) { <b>{o.v}</b> }}<Part v={pluck([{ v: n }], "v").join("")} /></Root> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `t[][A]` |
| 1 | handler `n := "B"` | `t[][B]` |

## Variant: a choice of views shown in a table, and an optional parameter left out

```rx
fn tag(s: string, mark?: string): string => s + (mark ?? "")
context rows: View
component Table(p: { a?: View; b?: View; z: boolean; children?: View }) { provide rows = p.z ? p.a : p.b
  <div>{p.children}</div> }
component Body() { <table><tbody>{use rows}</tbody></table> }
component Give(p: { z: boolean; children: View }) { <Table z={p.z} a={p.children} b={p.children}><Body /></Table> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Give z={n == "A"}><tr><td>{tag(n)}</td></tr></Give> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `tA` |
| 1 | handler `n := "B"` | `tB` |

## Variant: a fn that instantiates, called in a component whose provision reads what is above it

```rx
fn createLast<T>(ref x: T, pad?: string) {
  shown = `${x}${pad ?? ""}`
  { shown: shown }
}
context c: string = "-"
component P(p: { v: string; children?: View }) { h = createLast(p.v)
  provide c = (use c) + h.shown
  <b>{p.children}</b> }
component Leaf() { <i>{use c}</i> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><P v={n}><P v="A"><Leaf /></P></P> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `t-AA` |
| 1 | handler `n := "B"` | `t-BA` |

## Variant: a view asked for, given what a generic fn answers or nothing

```rx
fn orElse<T>(a: T | undefined, b?: T): T | undefined => a ?? b
component Field(p: { label?: View }) { <b>{if p.label { <i>Y</i> } else { <i>N</i> }}{p.label ?? "D"}</b> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Field label={(orElse(n == "A" ? undefined : n) ?? "none")} /><Field label={n == "A" ? undefined : (orElse(n == "A" ? undefined : n) ?? "none")} /><Field /> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `tYnoneNDND` |
| 1 | handler `n := "B"` | `tYBYBND` |

## Variant: a view with a parameter, shown with what a fn that instantiates answers

```rx
fn createLast<T>(ref x: T, pad?: string) {
  shown = `${x}${pad ?? ""}`
  { shown: shown }
}
component Row(p: { v: string; children: (s: { v: string; i: number }) => View }) { source k := 0
  <p onClick={() => { k := k + 1 }}><p.children v={p.v} i={k} /></p> }
export default component App() { source n := "A"
  h = createLast(n, "+")
  <button onClick={() => { n := "B" }}>t</button><Row v={h.shown}>{view (s) { <i>{s.v}:{s.i}</i> }}</Row> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `tA+:0` |
| 1 | handler `n := "B"` | `tB+:0` |

## Variant: ids minted while the action waits: `latest` reads the held write

```rx
fn first<T>(xs: T[], or: T): T => len(xs) > 0 ? xs[0] : or
export default component App() { source n := "A"
  source seq := 0
  source cards := ""
  action add(id: number) {
    let r = await fetch("add" + str(id)) catch (e) => ""
    cards := v => v + "/" + str(id)
  }
  <button onClick={() => { n := "B" }}>t</button><b>{first([n, "z"], "-")}</b><button onClick={() => { let k = latest seq + 1; seq := k; add(k) }}>+</button>{cards}<s>{seq}</s> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `tA+0` |
| 1 | handler `let k = latest seq + 1; seq := k; add(k)` | `tA+0` |
| 2 | handler `let k = latest seq + 1; seq := k; add(k)` | `tA+0` |
| 3 | resolve "add1" "ok" | `tA+0` |
| 4 | resolve "add2" "ok" | `tA+/1/22` |
| 5 | handler `n := "B"` | `tB+/1/22` |

## Rejected variants

The handler without `latest`, in a view with a parameter and as a callback prop: the next click would mint the same id.

```rx
-- reject: STALE_NEXT_READ
fn first<T>(xs: T[], or: T): T => len(xs) > 0 ? xs[0] : or
component Row(p: { v: string; children: (s: { v: string; i: number }) => View }) { source k := 0
  <p onClick={() => { k := k + 1 }}><p.children v={p.v} i={k} /></p> }
component Each(p: { children: (s: { i: number }) => View }) { <span><p.children i={1} /></span> }
export default component App() { source n := "A"
  source seq := 0
  source cards := ""
  action add(id: number) {
    let r = await fetch("add") catch (e) => ""
    cards := v => v + "/" + str(id)
  }
  <button onClick={() => { n := "B" }}>t</button><Row v={first([n, "z"], "-")}>{view (s) { <i>{s.v}:{s.i}</i> }}</Row><Each>{view (s) { <button onClick={() => { let k = seq + 1; seq := k; add(k) }}>{s.i}</button> }}</Each>{cards} }
```

```rx
-- reject: STALE_NEXT_READ
fn first<T>(xs: T[], or: T): T => len(xs) > 0 ? xs[0] : or
context c: string = "-"
component P(p: { v: string; children?: View }) { provide c = p.v
  <b>{p.children}</b> }
component Leaf() { <i>{use c}</i> }
component Btn(p: { onGo: () => void }) { <button onClick={() => { p.onGo() }}>+</button> }
export default component App() { source n := "A"
  source seq := 0
  source cards := ""
  action add(id: number) {
    let r = await fetch("add") catch (e) => ""
    cards := v => v + "/" + str(id)
  }
  <button onClick={() => { n := "B" }}>t</button><P v={first([n, "z"], "-")}><Leaf /></P><Leaf /><Btn onGo={() => { let k = seq + 1; seq := k; add(k) }} />{cards} }
```
