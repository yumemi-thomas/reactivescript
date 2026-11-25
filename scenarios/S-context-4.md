# S-context-4 — a context read in a component's children, where they are written

Rules: RG-4c, RG-7b, R-f-5, W-2, SV-3.

What is written between `<P>` and `</P>` keeps the caller's names and is made where P shows it, so a `use` there reads
what P provides, as one in a component applied there does. (Compiled, it read at the caller: what P provides was not
seen, and a context with no default threw, where both checkers credit the provision.) Each program here shows its children
in one place: how often they are made, where a component shows them again, is RG-4c's to say, and is not said here.
Children with an `await` in their own place are still read at the caller, compiled (proposals/bugs/36); so are a
snapshot of them and children a context carries, in every runner.

## Program

```rx
context c: string = "none"
component P(props: { v: string, children: View }) { provide c = props.v
  <div>{props.children}</div> }
export default component App() {
  source k := "x"
  provide c = k
  <P v="in">{use c}<P v={use c}>{use c}</P></P>
  <p>{use c}</p>
}
```

## Frames

| instant | action | frame | effect |
| ------- | ------ | ----- | ------ |
| 0 | mount | ininx | |
| 1 | handler `k := "z"` | ininz | |

## Variant: if and for and attr

```rx
context c: string = "none"
component P(props: { v: string, children?: View }) { provide c = props.v
  <div>{props.children}</div> }
export default component App() { source xs := [1, 2]
 <P v="a">{if (use c) == "a" { <u>yes</u> } else { <u>no</u> }}{for x in (use c).split("") { <i>{x}</i> }}<b class={use c}>{[use c, "!"].join("")}</b></P> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `yesaa!` |  |

## Variant: handler

```rx
context c: string = "none"
component P(props: { v: string, children?: View }) { provide c = props.v
  <div>{props.children}</div> }
export default component App() { source seen := ""
 <P v="a"><button onClick={() => { seen := peek(use c) }}>{seen}</button></P> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount |  |  |
| 1 | handler `seen := "q"` | `q` |  |

## Variant: boundary in the child

```rx
import pure { fetch } from "./prelude"
context u: { name: string }
component P(props: { children?: View }) { x = await fetch("u")
 provide u = x
 <div>{errored fallback(e) { <p>bad</p> } { {loading fallback { <i>wait</i> } { {props.children} }} }}</div> }
export default component App() { <P>{(use u).name}</P> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `wait` |  |
| 1 | resolve "u" {name: "Ada"} | `Ada` |  |

## Variant: fallback

```rx
context c: string = "none"
component P(props: { v: string, children?: View }) { provide c = props.v
  <div>{props.children}</div> }
import pure { fetch } from "./prelude"
export default component App() { <P v="a">{errored fallback(e) { <i>e{use c}</i> } { {loading fallback { <i>{use c}</i> } { x = await fetch("q")
 <b>{x}{use c}</b> }} }}</P> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `a` |  |
| 1 | reject "q" "no" | `ea` |  |

## Variant: equation in child

```rx
context c: string = "none"
component P(props: { v: string, children?: View }) { provide c = props.v
  <div>{props.children}</div> }
component Q(props: { children?: View }) { mine = props.children
 provide c = "q"
 <div>{mine}</div> }
export default component App() { <Q>{use c}</Q> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `q` |  |

## Variant: fn in children block

```rx
context c: string = "none"
component P(props: { v: string, children?: View }) { provide c = props.v
  <div>{props.children}</div> }
fn useC() { use c }
export default component App() { <P v="a">{if true { v = useC()
 <b>{v}</b> }}</P> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `a` |  |

## Variant: effect in a block

```rx
context c: string = "none"
component P(props: { v: string, children?: View }) { provide c = props.v
  <div>{props.children}</div> }
export default component App() { source k := "a"
 <P v={k}>{if true { v = use c
 effect (v) { log($0) }
 <b>{v}</b> }}</P> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `a` | log(a) |
| 1 | handler `k := "b"` | `b` | log(b) |

## Variant: pure closure

```rx
context c: string = "none"
component P(props: { v: string, children?: View }) { provide c = props.v
  <div>{props.children}</div> }
export default component App() { <P v="a">{["x", "y"].map(s => s + (use c)).join("")}</P> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `xaya` |  |


## Variant: decls, writes, nested

```rx
context toggle: { pressed: boolean }
component Toggle(props: { children: View, first?: boolean }) {
  source lit := peek(props.first) ?? false
  provide toggle = { pressed: lit }
  <div onClick={() => { lit := !lit }}>{props.children}</div>
}
component Wrap(props: { children: View }) { source up := true
  <div>{if up { {props.children} }}</div> }
export default component App() {
  source hi := "!"
  <Toggle first={true}>{(use toggle).pressed ? "Y" : "N"}<Wrap><Toggle>{(use toggle).pressed ? "y" : "n"}{hi}<i class={(use toggle).pressed ? "a" : "b"} onClick={() => { hi := "?" }}></i></Toggle></Wrap></Toggle>
}
```

| instant | action | frame | effect |
| ------- | ------ | ----- | ------ |
| 0 | mount | Yn! | |
| 1 | handler `hi := "?"` | Yn? | |

## Variant: the element given its attributes

```rx
context trig: { attrs: { title: string, class: string }, open: boolean }
component Trigger(props: { asChild?: boolean, children: View }) {
  source lit := false
  attrs = { title: lit ? "t" : "u", class: "x" }
  provide trig = { attrs: attrs, open: lit }
  {if props.asChild { {props.children} } else { <button {...attrs} onClick={() => { lit := !lit }}>{props.children}</button> }}
}
export default component App() {
  <Trigger asChild={true}><a href="/x" {...(use trig).attrs}>go {(use trig).attrs.title}</a></Trigger>
  <p>.</p>
}
```

| instant | action | frame | effect |
| ------- | ------ | ----- | ------ |
| 0 | mount | go u. | |
| 1 | handler `lit := true` | go t. | |

## Variant: a boundary that asks by it

```rx
import pure { fetch } from "./prelude"
context c: string = "none"
component P(props: { children?: View }) {
  provide c = "a"
  {errored fallback(e) { <b>bad</b> } { <p>{props.children}</p> }}
}
export default component App() {
  <P>{loading on(use c) fallback { <i>{use c}</i> } { x = await fetch(use c)
  <b>{x}</b> }}</P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a |  |
| 1 | resolve "a" "1" | 1 |  |

## Variant: a stream provided

```rx
import pure { fetch } from "./prelude"
context c: string
component P(props: { children?: View }) {
  x = await* fetch("q")
  provide c = x
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() {
  <P>{use c}!</P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "q" "1" | 1! |  |
| 2 | resolve "q" "2" | 2! |  |

## Variant: a failing provision

```rx
import pure { fetch } from "./prelude"
context u: { n: string }
component L(props: { children?: View }) {
  x = await fetch("u")
  provide u = x
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() {
  <L><b>{(use u).n}</b></L>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | reject "u" "no" | bad |  |

## Variant: shown in a portal

```rx
context c: string = "n"
component P(props: { children?: View }) {
  provide c = "in"
  <div>x{portal { {props.children} }}</div>
}
export default component App() {
  <P>{use c}</P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | x » in |  |

## Variant: three deep

```rx
context c: string = "none"
component P(props: { v: string, children?: View }) {
  provide c = props.v
  <div>{props.children}</div>
}
export default component App() {
  <P v="a">{use c}<P v="b">{use c}<P v="c">{use c}</P></P></P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | abc |  |

## Variant: a store provided

```rx
context s: { items: { id: number, t: string }[], n: number }
component St(props: { children?: View }) {
  source d := { items: [{ id: 1, t: "a" }, { id: 2, t: "b" }], n: 0 }
  provide s = d
  <div>{props.children}</div>
}
export default component App() {
  <St>{for x in (use s).items { <b>{x.t}</b> }}</St>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | ab |  |
| 1 | handler `d.items := [{ id: 2, t: "b" }, { id: 1, t: "q" }]` | bq |  |

## Variant: a typed boundary

```rx
error Bad(k) => `bad ${k}`
context n: number
component P(props: { children?: View }) {
  source k := 1
  v = k > 1 ? throw Bad(k) : k
  provide n = v
  {errored fallback(e: Bad) { <i>{e.message}</i> } { {props.children} }}
}
export default component App() {
  <P>{use n}</P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1 |  |
| 1 | handler `k := 2` | bad 2 |  |
| 2 | handler `k := 1` | 1 |  |

## Variant: a guess

```rx
import pure { fetch } from "./prelude"
context c: string
component G(props: { children?: View }) {
  source v := "a"
  provide c = v
  action go() {
    guess v := "b"
    await fetch("save") catch (e) => ""
    v := "c"
  }
  <div onClick={() => { go() }}>{props.children}</div>
}
export default component App() {
  <G>{use c}</G>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a |  |
| 1 | handler `go()` | b |  |
| 2 | resolve "save" "x" | c |  |

## Variant: carried by a context, or snapshotted

```rx
context c: string = "out"
context child: View
component Q() { provide c = "q"
  <i>{use child}</i> }
component P(props: { children?: View }) {
  provide child = props.children
  <Q /> }
component S(props: { children?: View }) { provide c = "in"
  source x := peek(props.children)
  <u>{x}</u> }
export default component App() { <P>{use c}</P><S>{use c}</S> }
```

| instant | action | frame | effect |
| ------- | ------ | ----- | ------ |
| 0 | mount | outout | |

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
context c: string
component P(props: { children?: View }) { provide c = "x"
 <div>{props.children}</div> }
component O(props: { children?: View }) { <div>{props.children}</div> }
export default component App() { <P>a</P><O>{use c}</O> }
```

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetch } from "./prelude"
context u: { name: string }
component P(props: { children?: View }) { x = await fetch("u")
 provide u = x
 <div>{props.children}</div> }
export default component App() { <P>{(use u).name}</P> }
```

```rx
-- reject: MUTATION_IN_PLACE
context u: { xs: number[] }
component P(props: { children?: View }) { source s := [1]
 provide u = { xs: s }
 <div>{props.children}</div> }
export default component App() { <P><button onClick={() => { (use u).xs.push(2) }}>a</button></P> }
```

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
context n: number
component P(props: { children?: View }) { source k := 1
 provide n = k
 <div>{props.children}</div> }
export default component App() { <P>{[1].map(x => { use n := x })}</P> }
```

```rx
-- reject: CONTEXT_NOT_FOUND
context c: string
component P(props: { children?: View }) { provide c = "x"
 <div>{props.children}</div> }
component O(props: { children?: View }) { <div>{props.children}<P>b</P></div> }
export default component App() { <O>{use c}</O> }
```
