# S-context-13 — a default that names what the module declares after the context; an attribute that waits

Rules: RG-7b, H-4, H-5; X7 of the roadmap (track 2, e).

A context's default is read where a part asks for it, so it may name a source the
module declares below it (the runtimes made it when the context was declared, and
the compiled code threw `Cannot access v$d before initialization`). And an attribute
whose value is awaited waits as a read in content does: the loading boundary above
shows its fallback until it lands (the interpreter showed the element at once).

## Program

```rx
source d := "x"
context c: string = d
component P(props: { children?: View }) {
  <div>{props.children}</div>
}
export default component App() {
  <P>{use c}</P>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | x |  |
| 1 | handler `d := "y"` | y |  |

## Variant: an attribute that waits

```rx
import pure { fetch } from "./prelude"
context c: string = "none"
component P(props: { children?: View }) {
  provide c = "a"
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() {
  <P><b class={await fetch(use c)}>x</b></P>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `w` |
| 1 | resolve "a" "1" | `x` |
