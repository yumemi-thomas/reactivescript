# S-context-4 — a context read in a component's children, where every runner agrees

Rules: RG-4c, RG-7b, 08.

A `use` in a component's children is the interpreter's where the component shows them; compiled code reads it at the caller
([proposals/bugs/33](../proposals/bugs/33-use-in-children.md)). These are the programs of that shape on which the runners
agree, on upstream as well: what a fix must not change. A snapshot and what a context carries are the caller's, at each
read of them.

## Program

```rx
context c: string = "out"
component P(p: { children: View }) {
  provide c = "in"
  source pair := peek([p.children, p.children])
  <i>{pair[0]}{pair[1]}</i>
}
export default component App() { <P>{use c}</P> }
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | outout | |

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
