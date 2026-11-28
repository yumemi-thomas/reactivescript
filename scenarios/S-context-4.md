# S-context-4 — a view a component is given is made where it is shown

Rules: RG-4c, RG-7b, 08, 07 §3.

A component's content is a block of the caller's names, owned where it is shown (RG-4c, proposed 2026-11-25): each place
it is shown has its own, and what is provided, awaited and caught there is that place's. Shown twice, a component in it is
made twice; hidden and shown again, it is made again. (Compiled, a `use` written in the content itself was read where the
content is written: proposals/bugs/33, 36.)

## Program

```rx
context c: string = "out"
component Seen() { source n := 0
  effect () { log("made") }
  <u>{use c}{n}</u> }
component Twice(p: { children: View }) { source on := true
  provide c = "in"
  <b>{p.children}</b>{if on { provide c = "deep"
    <i>{p.children}</i> }} }
export default component App() { <Twice><Seen />{use c}</Twice> }
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `in0indeep0deep` | log(made); log(made) |
| 1 | handler `on := false` | `in0in` |  |
| 2 | handler `on := true` | `in0indeep0deep` | log(made) |

## Variant: a context the component provides, used in its content

```rx
context toggle: { pressed: boolean }
component Toggle(props: { children: View }) {
  source lit := false
  provide toggle = { pressed: lit }
  <button onClick={() => { lit := !lit }}>{props.children}</button>
}
export default component App() {
  source mark := "!"
  <Toggle>{(use toggle).pressed ? "on" : "off"}{mark}</Toggle>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `off!` |  |
| 1 | handler `lit := true` | `on!` |  |
| 2 | handler `mark := "?"` | `on?` |  |

## Variant: asked for, with a default, under a choice, spread

Whether content was given is asked without making it: `Made` logs once where it is shown, and no more for the `if`.

```rx
component Opt(p: { children?: View; label?: View }) {
  {if p.children { <div>{p.children}</div> } else { <i>none</i> }}<s>{p.label ?? "-"}</s>{if !p.children { <u>!</u> }}{if p.children != undefined { <u>?</u> }}
}
component Made() { effect () { log("made") }
  <b>x</b> }
component Or(p: { on: boolean; children?: View }) { <em>{p.on ? p.children : "off"}</em><em>{p.children && "some"}</em> }
component Dflt({ children = "nothing" }: { children?: View }) { <q>{children}</q> }
component Spread(p: { children?: View; title?: string }) { <b {...p}>{p.children}</b> }
export default component App() {
  source on := true
  <Opt><Made /></Opt><Opt /><Or on={on}><Made /></Or><Dflt /><Dflt>d</Dflt><Spread title="t">s</Spread>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `x-?none-!xsomenothingds` | log(made); log(made) |
| 1 | handler `on := false` | `x-?none-!offsomenothingds` |  |
| 2 | handler `on := true` | `x-?none-!xsomenothingds` | log(made) |

## Variant: a provider that hands on what is above it

```rx
context cfg: { dir: string; size: string } = { dir: "ltr", size: "m" }
component Cfg(props: { size?: string; children: View }) {
  provide cfg = { ...(use cfg), size: props.size ?? (use cfg).size }
  <div>{props.children}</div>
}
component Page() { <i>{(use cfg).size}</i> }
export default component App() { <Cfg><Page /></Cfg><Cfg size="l"><b>{(use cfg).dir}{(use cfg).size}</b><Cfg><Page /></Cfg></Cfg> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `mltrll` |  |

## Variant: an await in content is asked where it is shown

```rx
import pure { fetch } from "./prelude"
context c: string
component Show(p: { children: View }) {
  provide c = "q"
  {loading fallback { <i>wait</i> } { {p.children} }}
}
export default component App() {
  {errored fallback(e) { <b>bad</b> } {
    provide c = "outer"
    <Show>{await fetch(use c)}</Show>
  }}
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `wait` |  |
| 1 | resolve "q" "ok" | `ok` |  |

## Variant: given on: as content, as an argument, in a spread

```rx
context c: string = "out"
component Inner(q: { children: View; part?: View }) { provide c = "inner"
  <i>{q.children}</i><u>{q.part}</u> }
component Outer(p: { children: View }) { provide c = "outer"
  <Inner part={p.children}>{p.children}</Inner> }
component All(p: { children: View }) { <Inner {...p} /> }
export default component App() { <Outer>{use c}</Outer><All>{use c}</All> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `innerinnerinner` |  |

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
