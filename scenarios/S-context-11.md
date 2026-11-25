# S-context-11 — a context given what it has: each form, and what it can fail with

Rules: C-1, RG-7b, RG-7e, R-f-5.

The forms of a provision given from its own context, one by one (the rule: S-context-9). A `use` written in what the
provision is given is what is above it — where it stands, under `latest`, in a closure a call runs; beside the
provision, the same `use` is that provision, so a name between is a cycle. Both checkers overflowed the stack on the
first of these (proposals/bugs/40).

## Program

What is above, read through a name above the block that provides:

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

## Variant: read in the provision itself

```rx
context c: string = "out"
component P(props: { v?: string, children: View }) {
  provide c = props.v ?? use c
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() {
  source k := "a"
  <P v={k}><P><Leaf /></P></P>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a` |
| 1 | handler `k := "b"` | `b` |

## Variant: under `latest`, and in a closure the value's own call runs

```rx
context c: string = "out"
component P(props: { children: View }) {
  provide c = latest(use c) + [1].map(x => (use c) + x).join("")
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `outout1` |

## Variant: a closure kept in the provision reads what is above it when it is called

```rx
context c: { n: number, twice: () => number } = { n: 1, twice: () => 2 }
component P(props: { n: number, children: View }) {
  provide c = { n: props.n, twice: () => (use c).n * 2 }
  <b>{props.children}</b>
}
component Leaf() { <i>{(use c).n}{(use c).twice()}</i> }
export default component App() {
  source k := 5
  <P n={k}><P n={7}><Leaf /></P></P>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `710` |
| 1 | handler `k := 6` | `712` |

## Accepted variants

Merged with what is above, in a block below:

```rx
-- accept
context cfg: { size: string, dark: boolean } = { size: "m", dark: false }
component Dark(props: { children: View }) {
  o = use cfg
  <b>{if true { provide cfg = { ...o, dark: true }
    {props.children} }}</b>
}
component Leaf() { <i>{(use cfg).size}</i> }
export default component App() { <Dark><Dark><Leaf /></Dark></Dark> }
```

Two contexts given from each other, in two regions (what a context can fail with is read through both):

```rx
-- accept
context c: string = "c"
context d: string = "d"
component P() {
  provide d = (use c) + "!"
  <b>{if true { provide c = (use d) + "?"
    <Leaf /> }}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P /> }
```

A block that provides is a region: what is above it is read in its provision.

```rx
-- accept
context c: string = "out"
component P(props: { children: View }) {
  <b>{if true { provide c = (use c) + "!"
    {props.children} }}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

## Rejected variants

A name beside the provision reads the provision:

```rx
-- reject: CYCLE
context c: string = "out"
component P(props: { children: View }) {
  o = use c
  provide c = o
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

… in one branch too:

```rx
-- reject: CYCLE
context c: string = "out"
component P(props: { children: View }) {
  source k := true
  o = use c
  provide c = k ? o : use c
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

Two contexts of one region, each given from the other:

```rx
-- reject: CYCLE
context c: string = "out"
context d: string = "d"
component P(props: { children: View }) {
  provide c = use d
  provide d = use c
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

A default of itself:

```rx
-- reject: CYCLE
context c: string = use d
context d: string = use c
export default component App() { <i>{use c}</i> }
```

Contexts given from each other: what another provision can fail with is the reader's.

```rx
-- reject: UNHANDLED_FAILURE
context c: string
context d: string
component P(props: { children: View }) {
  provide c = use d
  <b>{if true { provide d = use c
    {props.children} }}</b>
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
