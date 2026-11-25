# S-context-7 — whether a view was given: the argument as it was written

Rules: RG-4c, RG-7b, SV-7d.

What the second independent review found (2026-11-25), each as a program. Whether a view was given is asked by reading
the argument as it was written, with each view in it standing for itself: nothing is made. A view given on (an
argument, content, a spread, a rest, a default, a name, through any number of components) asks its giver; a choice
follows its branch, whose condition is read where it is asked and tracked; any other expression is a value and answers
as JavaScript has it (`0`, `""`, `undefined`), which is what it answered before the rule. So an explicit argument, a
spread and a rest answer alike, and `if p.label` agrees with `p.label ?? x`.

The program: a label and an icon that are a value which changes. Nothing is given until `ready`.

## Program

```rx
component Field(p: { label?: View; icon?: View }) {
  <b>{if p.label { <i>L</i> }}{p.icon ?? "default"}</b> }
export default component App() { source ready := false
  maybe = ready ? "ok" : undefined
  <button onClick={() => { ready := true }}>t</button><Field label={maybe} icon={maybe} /> }
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tdefault` |  |
| 1 | handler `ready := true` | `tLok` |  |

## Before hydration

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | tdefault |
| 1 | click "button" | tdefault |
| 2 | hydrate | tLok |

## Variant: an explicit argument, a spread and a rest answer alike: `0` is a value, not undefined

```rx
component Field(p: { label?: View }) { <b>{if p.label { <i>L</i> } else { <i>-</i> }}{p.label ?? "D"}</b> }
component Wrap(p: { label?: View; n?: number }) { { n, ...rest } = p
  <Field label={p.label} /><Field {...p} /><Field {...rest} /> }
export default component App() { <Wrap label={0} /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `-0-0-0` |  |

## Variant: … and nothing given is nothing given, three times

```rx
component Field(p: { label?: View }) { <b>{if p.label { <i>L</i> } else { <i>-</i> }}{p.label ?? "D"}</b> }
component Wrap(p: { label?: View; n?: number }) { { n, ...rest } = p
  <Field label={p.label} /><Field {...p} /><Field {...rest} /> }
export default component App() { <Wrap /> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `-D-D-D` |  |

## Variant: … and content given on is content, three times, and is not made to answer

```rx
component Made() { effect () { log("made") }
  <u>m</u> }
component Field(p: { label?: View }) { <b>{if p.label { <i>L</i> } else { <i>-</i> }}</b> }
component Wrap(p: { label?: View; n?: number }) { { n, ...rest } = p
  <Field label={p.label} /><Field {...p} /><Field {...rest} /> }
component Top(p: { children?: View }) { <Wrap label={p.children} n={1} /> }
export default component App() { <Top><Made /></Top> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `LLL` |  |

## Variant: a choice follows its branch: a flag that is awaited is waited for where it is asked

```rx
import pure { fetch } from "./prelude"
component Field(p: { on: boolean; title: View }) {
 x = p.on ? p.title : undefined
 {if x { <b>yes</b> } else { <i>no</i> }} }
export default component App() { {errored fallback(e) { <b>bad</b> } {
 {loading fallback { <b>w</b> } { flag = await fetch("flag")
 <Field on={flag == "1"} title="x" /> }} }} }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `w` |  |
| 1 | resolve "flag" "1" | `yes` |  |

## Variant: a view that is only asked for is placed nowhere

```rx
component Q(p: { children: View }) { <p>{p.children && "yes"}</p> }
export default component App() { <Q><div>x</div></Q> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `yes` |  |

## Variant: a provision reads what is above it, each time it is computed

```rx
context c: string = "-"
component Q(p: { children: View }) { provide c = (use c) + "!"
  <b>{p.children}</b> }
export default component App() { source n := "A"
  provide c = n
  <button onClick={() => { n := "B" }}>t</button><Q><Q>{use c}</Q></Q> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tA!!` |  |
| 1 | handler `n := "B"` | `tB!!` |  |

## Rejected variants

```rx
-- reject: VIEW_NOT_SHOWN
component Count(q: { n: number }) { <b>{q.n + 1}</b> }
component Pass(p: { n: View }) { <Count {...p} /> }
export default component App() { <Pass n="2" /> }
```

```rx
-- reject: VIEW_NOT_SHOWN
component Row(p: { part: View } | { part: View; n: number }) { <b>{str(p.part)}</b> }
export default component App() { <Row part="abc" /> }
```

```rx
-- reject: CONTENT_MODEL
component Q(p: { children: View }) { <p>{p.children || "none"}</p> }
export default component App() { <Q><div>x</div></Q> }
```
