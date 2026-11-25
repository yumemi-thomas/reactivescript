# S-context-4 — a context given what it has: what it can fail with

Rules: RG-7b, RG-7e, R-f-5.

A context's failures are its provisions', and a provision may use the context: it adds nothing to itself. Both checkers
overflowed the stack (proposals/bugs/40, which says what such a provision reads when it runs: not decided).

## Program

What is above is read above the region that provides:

```rx
context c: string = "out"
component P(props: { v?: string, children: View }) {
  o = use c
  <b>{if true { provide c = props.v ?? o
    {props.children} }}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() {
  source k := "a"
  <P v={k}><P><Leaf /></P></P>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a` |
| 1 | handler `k := "b"` | `b` |

## Accepted variants

```rx
-- accept
context c: string = "out"
component P(props: { children: View }) {
  provide c = (use c) + "!"
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

Two contexts, each given from the other:

```rx
-- accept
context c: string = "c"
context d: string = "d"
component P(props: { children: View }) {
  provide c = use d
  provide d = use c
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}{use d}</i> }
export default component App() { <P><Leaf /></P> }
```

## Rejected variants

What the other provision can fail with is still the reader's:

```rx
-- reject: UNHANDLED_FAILURE
context c: string
component P(props: { children: View }) {
  provide c = use c
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() {
  provide c = await fetch("c")
  <P><Leaf /></P>
}
```

… through the other context, and through a name:

```rx
-- reject: UNHANDLED_FAILURE
context c: string
context d: string
component P(props: { children: View }) {
  provide c = use d
  provide d = use c
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() {
  provide d = await fetch("d")
  provide c = "c"
  <P><Leaf /></P>
}
```

A name's failures are the same whoever asks first. `f` is asked first by the `use` of `c` it is itself part of, here under
a boundary; outside it, it is still refused:

```rx
-- reject: UNHANDLED_FAILURE
context c: string
component Leaf() { <i>{use c}</i> }
component P(props: { children: View }) {
  f = use c
  {errored fallback (e) { <i>e</i> } { <Leaf /> }}
  <b>{f}</b>
  {if true { provide c = f
    <i>{props.children}</i> }}
}
export default component App() {
  provide c = await fetch("c")
  <P>x</P>
}
```
