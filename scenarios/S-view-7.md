# S-view-7 — what a view component is given: plain content, a spread, nothing; what a type by a name says

Rules: RG-4c, W-1a, O-3, RG-7b, MO-9.

Plain content given where a view is taken as well is a view that asks nothing: owned where it is shown, so a `use` and an
`await` in it are of that place. Content of named views alone is none. A spread gives no view: where neither the record as
it is written nor a type says that it does not hold the field, the application is refused. A parameter's type is read
through names, of the module and of the `.rx` modules it imports (and through their signatures).

## Modules

```rx
-- module: ./s.rx
type L = number[]
export type S = { xs: L; kind?: "a" | "b" }
export type P = { children: (s: S) => View }
```

```rx
-- module: ./t.rx
import { S } from "./s.rx"
type L = string
export component T(p: { children: (s: S) => View }) {
  source xs := [1]
  <p.children xs={xs} />
}
export component O(p: { title?: string; cell?: (s: { n: number }) => View }) {
  source n := 1
  <p>{p.title ?? "-"}{if p.cell { <p.cell n={n} /> }}</p>
}
```

## Program

```rx
component T(p: { children?: () => View, cell: () => View }) {
  {if p.children { <b>present</b><p.children /> } else { <i>absent</i> }}
  <p.cell />
}
export default component App() {
  <T>
    {view cell () { <b>!</b> }}
  </T>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | absent! |  |

## Variant: a spread of the fields, children among them

```rx
component T(p: { children: (s: { children: string }) => View }) {
  <p.children {...{children: "ok"}} />
}
export default component App() {
  <T>{view (s) { <b>{s.children}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | ok |  |

## Variant: plain, a context

```rx
context c: string = "out"
component M(p: { children?: View | ((s: { n: number }) => View) }) {
  provide c = "in"
  source n := 1
  <div><p.children n={n} /></div>
}
export default component App() { <M><b>{use c}</b>!<M>{use c}?</M></M> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | in!in? |  |

## Variant: plain, a question

```rx
import pure { fetch } from "./prelude"
context c: string = "out"
component M(p: { children?: View | ((s: { n: number }) => View) }) {
  provide c = "in"
  source n := 1
  <div>{loading fallback { <i>w</i> } { <p.children n={n} /> }}</div>
}
export default component App() { <M>{use c}{await fetch(use c) catch (e) => "bad"}!</M> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "in" "ok" | inok! |  |

## Variant: plain, a question among others

```rx
import pure { fetch } from "./prelude"
component M(p: { children?: View | ((s: { n: number }) => View) }) {
  source n := 1
  <div><p.children n={n} /></div>
}
component P(p: { children: View }) { <b>{p.children}</b> }
export default component App() { {loading fallback { <i>w</i> } { <P><M>{await fetch("q") catch (e) => "bad"}</M>{await fetch("r") catch (e) => "bad"}</P> }} }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "q" "a" | w |  |
| 2 | resolve "r" "b" | ab |  |

## Variant: plain, in two places, live

```rx
component M(p: { children?: View | ((s: { n: number }) => View) }) {
  source n := 1
  <p.children n={n} /><p.children n={n} />
}
export default component App() { source m := "a"
  <M><b>{m}</b></M><M>{m}</M><M />
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | aaaa |  |
| 1 | handler `m := "b"` | bbbb |  |
| 2 | handler `n := 2` | bbbb |  |

## Variant: plain, state in it

```rx
component M(p: { children?: View | ((s: { n: number }) => View) }) {
  source n := 1
  <div><p.children n={n} /></div>
}
export default component App() { <M>{if true { source k := 0
  <b>{k}</b> }}</M> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 0 |  |
| 1 | handler `k := 5` | 5 |  |
| 2 | handler `n := 2` | 5 |  |

## Variant: plain beside a named one

```rx
component T(p: { cell?: (s: { v: string }) => View, children?: View | ((s: { n: number }) => View) }) { source n := 1
 {if p.cell { <p.cell v="c" /> }}<p.children n={n} /> }
export default component App() { source m := "a"
 <T>x{view cell (s) { <i>{s.v}</i> }}{m}</T> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | cxa |  |
| 1 | handler `m := "b"` | cxb |  |

## Variant: plain, the children of the giver

```rx
component M(p: { children?: View | ((s: { n: number }) => View) }) {
  source n := 1
  <div><p.children n={n} /></div>
}
component W(q: { children?: View }) { <M><i>{q.children}</i>-</M> }
export default component App() { source m := "a"
 <W>{m}</W> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a- |  |
| 1 | handler `m := "b"` | b- |  |

## Variant: forwarded

```rx
context c: string = "out"
component M(p: { children?: View | ((s: { n: number }) => View) }) {
  source n := 1
  provide c = "in"
  <div><p.children n={n} /></div>
}
component O(p: { children?: View | ((s: { k: string }) => View) }) { provide c = "o"
 <M><p.children k="k" /></M> }
export default component App() { <O>{use c}</O><O>{view (s) { {s.k}{use c} }}</O> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | inkin |  |

## Variant: a type by a name

```rx
import { P } from "./s.rx"
type Cb = (s: Row) => View
interface Row { n: number }
component A(p: P) { source xs := [1, 2]
  <p.children xs={xs} />
}
component B(p: { children: Cb }) { source n := 1
  <p.children n={n} />
}
export default component App() {
  <A>{view (s) { <i>{len(s.xs)}</i> }}</A><B>{view (s) { <b>{s.n}</b> }}</B>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 21 |  |
| 1 | handler `n := 2` | 22 |  |
| 2 | handler `xs := [1]` | 12 |  |

## Variant: a spread that gives no view

```rx
import { O } from "./t.rx"
type Q = { title?: string; o: { title?: string } }
component W(q: Q) { <O {...q} /><O {...q.o} /> }
component R(q) { { cell: none, ...rest } = q
  <O {...rest} /> }
component G(q) { <O {...q}>{view cell (s) { {s.n} }}</O> }
export default component App() {
  source k := true
  source xs := [{ title: "x" }]
  a = { title: "t" }
  <W title="w" o={{ title: "o" }} /><R title="r" /><G title="g" /><O {...a} /><O {...(k ? a : {})} />{for x in xs { <O {...x} /> }}
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | worg1ttx |  |
| 1 | handler `k := false` | worg1t-x |  |

A component's view is named nowhere but where it is shown. Where a library keeps it in a closure, a record, an effect or a
handler, or asks for children that may be plain, this is how it is written:

## Variant: in a loop, not a callback

```rx
component Grid(p: { rows: string[][], cell: (s: { v: string, r: number }) => View }) { {for r in p.rows { <p>{for v in r { <p.cell v={v} r={len(r)} /> }}</p> }} }
export default component App() { source m := "."
 <Grid rows={[["a", "b"], ["c"]]}>{view cell (s) { <i>{s.v}{s.r}{m}</i> }}</Grid> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a2.b2.c1. |  |
| 1 | handler `m := "!"` | a2!b2!c1! |  |

## Variant: given on, not put in a record

```rx
component Part(p: { children: (s: { on: boolean }) => View }) { source on := false
 <button><p.children on={on} /></button> }
component Trigger(p: { children: (s: { on: boolean, k: string }) => View }) {
 <Part>{view (s) { <p.children on={s.on} k="k" /> }}</Part> }
export default component App() { <Trigger>{view (s) { {s.on ? "on" : "off"}{s.k} }}</Trigger> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | offk |  |
| 1 | handler `on := true` | onk |  |

## Variant: the rest given on, the view shown among the children

```rx
component Part(p: { attrs: any, children?: View | ((s: { on: boolean }) => View) }) { source on := false
 <button {...p.attrs}><p.children on={on} /></button> }
component Trigger(p: { title?: string, children?: View | ((s: { on: boolean }) => View) }) {
 { children: none, ...rest } = p
 <Part attrs={rest}><p.children on={false} /></Part> }
export default component App() { <Trigger title="t">{view (s) { {s.on ? "on" : "off"} }}</Trigger><Trigger>plain</Trigger> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | offplain |  |

## Variant: with what is shown without it

```rx
component Hint(p: { k: string, children?: (s: { k: string }) => View }) {
  <kbd>{if p.children { <p.children k={p.k} /> } else { <i>{p.k}</i> }}</kbd>
}
export default component App() { source k := "x"
  <Hint k={k} /><Hint k={k}>{view (s) { <b>{s.k}!</b> }}</Hint><Hint k={k}>{view () { <i>plain</i> }}</Hint>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | xx!plain |  |
| 1 | handler `k := "y"` | yy!plain |  |

## Variant: beside a context, not in one

```rx
context cell: { v: string }
component Item(p: { v: string, children: View }) { provide cell = { v: p.v }
 <li>{p.children}</li> }
component List(p: { xs: string[], row: (s: { v: string }) => View }) { {for x in p.xs { <Item v={x}><p.row v={x} /></Item> }} }
component Text() { <b>{(use cell).v}</b> }
export default component App() { <List xs={["a", "b"]}>{view row (s) { <Text />{s.v} }}</List> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | aabb |  |

## Variant: an effect of the view

```rx
component T(p: { children: (s: { n: number }) => View }) { source n := 1
 effect (n) { log($0) }
 <p.children n={n} /> }
export default component App() { <T>{view (s) { effect (s.n) { log("v", $0) }
 <i>{s.n}</i> }}</T> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1 | log(1); log(v, 1) |
| 1 | handler `n := 2` | 2 | log(2); log(v, 2) |

## Variant: a handler given to it

```rx
component T(p: { children: (s: { open: boolean, onOpen: () => void }) => View }) { source open := false
 <p.children open={open} onOpen={() => { open := true }} /> }
export default component App() { <T>{view (s) { <button onClick={() => { s.onOpen() }}>{s.open ? "o" : "c"}</button> }}</T> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | c |  |
| 1 | handler `open := true` | o |  |

## Rejected variants

```rx
-- reject: MUTATION_IN_PLACE
import { T } from "./t.rx"
export default component App() { <T>{view (s) { <b onClick={() => { s.xs.push(2) }}>x</b> }}</T> }
```

```rx
-- reject: MUTATION_IN_PLACE
type S = { xs: number[]; kind: "a" | "b" }
component T(p: { children: (s: S) => View }) { source xs := [1]
  <p.children xs={xs} /> }
export default component App() { <T>{view (s) { <b onClick={() => { s.xs.push(2) }}>x</b> }}</T> }
```

```rx
-- reject: MUTATION_IN_PLACE
interface S { xs: number[] }
component T(p: { children: (s: S) => View }) { source xs := [1]
  <p.children xs={xs} /> }
export default component App() { <T>{view (s) { <b onClick={() => { s.xs.push(2) }}>x</b> }}</T> }
```

```rx
-- reject: MUTATION_IN_PLACE
import { S } from "./s.rx"
component T(p: { children: (s: S) => View }) { source xs := [1]
  <p.children xs={xs} /> }
export default component App() { <T>{view (s) { <b onClick={() => { s.xs.push(2) }}>x</b> }}</T> }
```

```rx
-- reject: MUTATION_IN_PLACE
import { P as Q } from "./s.rx"
component T(p: Q) { source xs := [1]
  <p.children xs={xs} /> }
export default component App() { <T>{view (s) { <b onClick={() => { s.xs.push(2) }}>x</b> }}</T> }
```

```rx
-- reject: MUTATION_IN_PLACE
type R = { tags: string[] }
component L(p: { rows: R[], cell: (s: { row: R }) => View }) { {for x in p.rows { <p.cell row={x} /> }} }
export default component App() { source rows := [{ tags: ["a"] }]
  <L rows={rows}>{view cell (s) { <b onClick={() => { s.row.tags.push("") }}>x</b> }}</L> }
```

```rx
-- reject: VIEW_FN_EXPECTED
import { O } from "./t.rx"
component W(q) { <O {...q} /> }
export default component App() { <W title="t" /> }
```

```rx
-- reject: VIEW_FN_EXPECTED
import { O } from "./t.rx"
export default component App() { a: any = true ? { cell: s => s.n } : {}
  <O {...a} /> }
```

```rx
-- reject: VIEW_FN_EXPECTED
import { O } from "./t.rx"
component W(q: { cell?: (s: { n: number }) => View }) { <O {...q} /> }
export default component App() { <W cell={s => s.n} /> }
```

```rx
-- reject: VIEW_FN_EXPECTED
import { O } from "./t.rx"
export default component App() { source st := { o: { cell: s => s.n } }
  <O {...st.o} /> }
```

```rx
-- reject: VIEW_FN_EXPECTED
import { O } from "./t.rx"
export default component App() { source xs := [{ title: "t" }, { cell: s => s.n }]
  {for x in xs { <O {...x} /> }} }
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(p: { children?: () => View }) {
  {if p.children { <p.children /> } else { <b>absent</b> }}
}
export default component App() { <T>{view children () { <i>ok</i> }}</T> }
```

```rx
-- reject: VIEW_FN_MISPLACED
context c: any
component T(p: { children: () => View }) {
  provide c = p.children
  <p.children />
}
export default component App() { <T>{view () { <b>ok</b> }}</T> }
```

```rx
-- reject: VIEW_FN_MISPLACED
context c: any
component T(p: { children: () => View }) {
  r = { cell: p.children }
  <p.children />
}
export default component App() { <T>{view () { <b>ok</b> }}</T> }
```

```rx
-- reject: VIEW_FN_MISPLACED
context c: any
component T(p: { children: () => View }) {
  f = () => p.children
  <p.children />
}
export default component App() { <T>{view () { <b>ok</b> }}</T> }
```

```rx
-- reject: VIEW_FN_MISPLACED
context c: any
component T(p: { children: () => View }) {
  effect (p.children) { log("x") }
  <p.children />
}
export default component App() { <T>{view () { <b>ok</b> }}</T> }
```

```rx
-- reject: VIEW_FN_MISPLACED
component M(p: { children?: View | ((s: { n: number }) => View) }) {
  source n := 1
  <div>{if p.children { <p.children n={n} /> } else { <i>empty</i> }}</div>
}
export default component App() { <M>ok</M> }
```
