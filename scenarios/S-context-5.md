# S-context-5 — a context used in a component's children: refused where the component provides it around them

Rules: RG-4c, RG-7b, 08, MO-3, MO-9.

RG-4c reads a component's children at the caller, RG-7b and 08 where they are shown. Where the component provides the context
around every place it shows them in its own view, the two differ, and it is `AMBIGUOUS_CONTEXT` (proposals/bugs/33): bind it
above, or use it in a component or in a block of the children. Everywhere else it is as it was: where the component provides
nothing of that name, where one place is outside the provision, and where the children go anywhere but into its own view (a
snapshot, a context, a value, a prop).

## Modules

```rx
-- module: ./p.rx
export context c: string = "out"
export component P(props: { children?: View }) { provide c = "in"
  <b>{props.children}</b> }
export component Pattern({ children, n = 1 }: { children?: View; n?: number }) { provide c = "in"
  {if children { <i>{n}{children}</i> }} }
export component Forward(q: { children: View }) { <P><i>{q.children}</i></P> }
export component Peek(p: { children: View }) { provide c = "in"
  source x := peek(p.children)
  <i>{x}</i> }
export component Both(p: { children: View }) { <b>{p.children}</b>{if true { provide c = "in"
  <i>{p.children}</i> }} }
export component None(p: { children: View }) { <b>{p.children}</b> }
```

## Program

```rx
import { c, P, Peek, Both, None } from "./p.rx"
context k: any
component Label() { <u>{use c}</u> }
component Z() { provide c = "z"
  <i>{use k}</i> }
component Carry(p: { children: View }) { provide k = p.children
  <Z /> }
export default component App() {
  v = use c
  f = () => use c
  <P><Label />{v}{f()}{if true { w = use c
    {w} }}</P>
  <p><None>{use c}</None><None><None>{use c}</None></None></p>
  <Peek>{use c}</Peek><Both>{use c}</Both><Carry>{use c}</Carry>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | inoutoutinoutoutoutoutoutout | |

## Rejected variants

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
export default component App() { <P>{use c}</P> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
export default component App() { <P><b title={use c}>x</b></P> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
export default component App() { <P><None>{use c}</None></P> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
export default component App() { <P><None>{[1].map(() => use c)}</None></P> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
export default component App() { <P>{if (use c) == "in" { <i>x</i> }}</P> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
export default component App() { <P>{for x in [use c] { <i>{x}</i> }}</P> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
export default component App() { <P><button onClick={() => { log(use c) }}>x</button></P> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
export default component App() { <P>{errored fallback(e) { <i>{use c}</i> } { <b>x</b> }}</P> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
export default component App() { <Pattern>{use c}</Pattern> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
export default component App() { <Forward>{use c}</Forward> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
component W(q: { children: View }) { { children, ...rest } = q
  <P>{children}</P> }
export default component App() { <W>{use c}</W> }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
import { c, P, Pattern, Forward, None } from "./p.rx"
import pure { fetch } from "./prelude"
export default component App() { {loading fallback { <i>w</i> } { <P>{await fetch(use c) catch (e) => "bad"}</P> }} }
```

```rx
-- reject: AMBIGUOUS_CONTEXT
context c: string
component P(p: { children: View }) { {for x in ["a", "b"] { provide c = x
  <b>{p.children}</b> }} }
export default component App() { <P>{use c}</P> }
```

A record, a prop, a closure: what reads the children is not their component's view.

```rx
-- accept
context c: string = "out"
component Q(q: { v: View }) { <i>{q.v}</i> }
component A(p: { children: View }) { provide c = "in"
  <Q v={p.children} /> }
component B(p: { children: View }) { provide c = "in"
  f = () => p.children
  <i>{f()}</i> }
component D(p: { children: View }) { provide c = "in"
  <Q {...p} v="" /> }
export default component App() { <A>{use c}</A><B>{use c}</B><D>{use c}</D> }
```
