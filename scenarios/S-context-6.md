# S-context-6 — a view is only shown: bindings, types, and what "was it given" answers

Rules: RG-4c, RG-4b, R-1, SV-7d.

What an independent review of the rule found (2026-11-25), each as a program. The rule follows bindings and types: a name
is the binding it is written under, and a view is a prop *declared* `View`; children declared a number are a number.
Whether a view was given is whether something was written for it: content, or an argument that is no literal nothing.
Nothing is made to answer, also through a name, a choice or `||`. An argument's expression is a value of the caller
(`title={use c}` reads the caller's provision); content is a block of the place that shows it.

The program: a name is the binding it is written under: a parameter of the same spelling.

## Program

```rx
component Rows(p: { children: View }) {
  x = p.children
  <b>{map([1], (x) => x + 1)[0]}</b>{x} }
export default component App() { <Rows>ok</Rows> }
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `2ok` |  |

## Variant: … an equation of another block

```rx
component Q(p: { children: View }) {
  {if true { x = p.children
    <i>{x}</i> }}
  {if true { x = 2
    <b>{x + 1}</b> }} }
export default component App() { <Q>ok</Q> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `ok3` |  |

## Variant: children whose type says a number are a number

```rx
component Price(p: { children?: number }) { amount = p.children ?? 0
  <b>{amount + 1}</b> }
export default component App() { <Price /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `1` |  |

## Variant: … and are asked as a number is

```rx
component Count(p: { children: number }) { <b>{p.children ? "yes" : "no"}</b> }
export default component App() { source n := 0
  <Count children={n} /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `no` |  |

## Variant: a view that was not given: `&&` is the nothing it is

```rx
component Q(p: { children?: View }) { <b>{p.children && "yes"}</b> }
export default component App() { <Q /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `` |  |

## Variant: … a default in the projection takes it

```rx
component Q({ children = undefined }: { children?: View }) { <b>{children != undefined ? "yes" : "no"}</b> }
export default component App() { <Q /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `no` |  |

## Variant: … `??` where it is shown

```rx
component Q(p: { children?: View }) { <b>{p.children ?? "none"}</b> }
export default component App() { <Q /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `none` |  |

## Variant: asked through a choice of names, nothing is made

```rx
component Made() { effect () { log("made") }
  <i>x</i> }
component Q(p: { on: boolean; children: View }) {
  x = p.on ? p.children : p.children
  <b>{x != undefined ? "yes" : "no"}</b> }
export default component App() { <Q on={true}><Made /></Q> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `yes` |  |

## Variant: … nor by `||`

```rx
component Made() { effect () { log("made") }
  <b>x</b> }
component Q(p: { children: View }) { {if p.children || true { <b>yes</b> }} }
export default component App() { <Q><Made /></Q> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `yes` |  |

## Variant: shown at two places, each has what is provided there

```rx
context c: string
component L(q: { v: string }) { <i>{q.v}</i> }
component N(q: { children: View }) { <u>{q.children}</u> }
component U() { <i>{use c}</i> }
component P(p: { children: View }) { <b>{p.children}</b>{if true { provide c = "in"
 <i>{p.children}</i> }} }
export default component App() { {if true { provide c = "out"
 <P><L v={use c} /></P> }} }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `outin` |  |

## Variant: an argument that is written was given, a literal nothing was not

```rx
component Made() { effect () { log("made") }
 <u>m</u> }
component Q(q: { part?: View; children?: View }) { <b>{q.part ? "P" : "p"}{q.children ? "C" : "c"}</b><i>{q.part}{q.children}</i> }
export default component App() { source s := ""
 <button onClick={() => { s := "x" }}>t</button><Q part={s} /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tPc` |  |
| 1 | handler `s := "x"` | `tPcx` |  |
| 2 | handler `s := "x"` | `tPcx` |  |

## Variant: … `""` is nothing given, and is not undefined

```rx
component Made() { effect () { log("made") }
 <u>m</u> }
component Q(q: { part?: View; children?: View }) { <b>{q.part ? "P" : "p"}{q.children ? "C" : "c"}</b><i>{q.part}{q.children}</i> }
export default component App() { <Q part={""} /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `pc` |  |

## Variant: a view given on is written: asked there, it was given

```rx
component Made() { effect () { log("made") }
 <u>m</u> }
component Q(q: { part?: View; children?: View }) { <b>{q.part ? "P" : "p"}{q.children ? "C" : "c"}</b><i>{q.part}{q.children}</i> }
component P(p: { children?: View }) { <Q part={p.children} /> }
export default component App() { <P /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `Pc` |  |

## Variant: a spread hands on what was given, and what was not

```rx
component Made() { effect () { log("made") }
 <u>m</u> }
component Q(q: { part?: View; children?: View }) { <b>{q.part ? "P" : "p"}{q.children ? "C" : "c"}</b><i>{q.part}{q.children}</i> }
component P(p: { children?: View; part?: View }) { <Q {...p} /> }
export default component App() { <P /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `pc` |  |

## Variant: … and a rest

```rx
component Made() { effect () { log("made") }
 <u>m</u> }
component Q(q: { part?: View; children?: View }) { <b>{q.part ? "P" : "p"}{q.children ? "C" : "c"}</b><i>{q.part}{q.children}</i> }
component P(p: { n?: number; children?: View; part?: View }) { { children, ...rest } = p
 <Q {...rest} /><u>{children}</u> }
export default component App() { <P part="x">k</P> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `Pcxk` |  |

## Variant: an await inside another's question, in content under the boundaries of what shows it

```rx
import pure { fetch } from "./prelude"
context c: string = "none"
component P(props: { children?: View }) {
  provide c = "a"
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() { <P>{await fetch((use c) + await fetch("k"))}</P> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `w` |  |
| 1 | resolve "k" "1" | `w` |  |
| 2 | resolve "a1" "2" | `2` |  |

## Variant: an argument is a value of the caller: what it reads is read where it is written

```rx
context c: string = "out"
component Q(p: { title: View }) { provide c = "in"
  <b>{p.title}</b> }
export default component App() { <Q title={use c} /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `out` |  |

## Rejected variants

```rx
-- reject: VIEW_NOT_SHOWN
component Q(p: { children: View }) {
  x = p.children
  y = pre x -> ""
  <b>{y}</b> }
export default component App() { <Q>x</Q> }
```

```rx
-- reject: VIEW_NOT_SHOWN
component C(p: { children: View }) {
  source n := 0
  y = pre n -> p.children
  <i>{y}</i> }
export default component App() { <C>ok</C> }
```

```rx
-- reject: VIEW_NOT_SHOWN
component Box(p: { children: View }) {
  x = true ? p.children : [p.children]
  <b>{x}</b> }
export default component App() { <Box>ok</Box> }
```

```rx
-- reject: VIEW_NOT_SHOWN
fn inspect(x) { str(x) }
component C(p: { children: View }) {
  x = true ? inspect(p.children) : p.children
  <i>{x}</i> }
export default component App() { <C>ok</C> }
```

```rx
-- reject: VIEW_NOT_SHOWN
component Q(p: { count?: number; children?: View }) { <b>{p.count}</b> }
component P(p: { children: View }) { <Q count={p.children} /> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
fn keep(x) { x }
component C(p: { heading: View; children?: View }) {
  { children, ...rest } = p
  o = keep(rest)
  <i>{children}</i> }
export default component App() { <C heading="x">ok</C> }
```

```rx
-- reject: CONTENT_MODEL
component Q(p: { part: View }) { <p>{p.part}</p> }
component Pass(p: { children: View }) { <Q part={p.children} /> }
export default component App() { <Pass><div>x</div></Pass> }
```

```rx
-- reject: CONTENT_MODEL
component Q({ children }: { children: View }) { <p>{children}</p> }
export default component App() { <Q><div>x</div></Q> }
```
```rx
-- reject: VIEW_NOT_SHOWN
context c: string = "out"
component P(props: { a?: string, children?: View }) { provide c = "in"
  { a, ...rest } = props
  <p {...rest}></p> }
export default component App() { <P>{use c}</P> }
```
