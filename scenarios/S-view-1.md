# S-view-1 — an `await` in a component's children

Rules exercised: R-1, 07 §3, RG-4c, E-11.

An `await` written between `<P>` and `</P>` is the caller's, as every reader there is (RG-4c): it is asked where the
children are written, and what shows them waits for it. (The crate did not lower it, proposals/bugs/37.) Children that read
a context are another matter, and the crate compiles none with an `await` there: proposals/bugs/36, and
`compiler/src/awaits.rs`, whose tests hold what it refuses.

## Program

```rx
import pure { fetch } from "./prelude"
context c: string = "out"
component P(props: { children?: View }) {
  provide c = "in"
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { <p>{props.children}</p> }} }}
}
component Seen() { <b>{use c}</b> }
export default component App() {
  source k := "a"
  <P>{await fetch(k)}<Seen /></P>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w | |
| 1 | resolve "a" "1" | 1in | |
| 2 | handler `k := "b"` | 1in | |
| 3 | resolve "b" "2" | 2in | |

## Variant: in an element, and in an application in the children

```rx
import pure { fetch } from "./prelude"
component P(props: { children?: View }) {
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() {
  <P><p><P>{await fetch("q")}</P></p>{await fetch("r")}</P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w | |
| 1 | resolve "q" "1" | w | |
| 2 | resolve "r" "2" | 12 | |

## Variant: under a condition

```rx
import pure { fetch } from "./prelude"
component P(props: { children?: View }) {
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() {
  source k := false
  <P>{k ? await fetch("q") : "no"}</P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | no | |
| 1 | handler `k := true` | no | |
| 2 | resolve "q" "1" | 1 | |

## Variant: what an if and a for read

```rx
import pure { fetch } from "./prelude"
component P(props: { children?: View }) {
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() {
  <P>{if await fetch("q") { <i>y</i> } else { <i>n</i> }}{for x in await fetch("r") { <i>{x}</i> }}</P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w | |
| 1 | resolve "q" "1" | w | |
| 2 | resolve "r" ["1", "2"] | y12 | |

## Variant: it fails, and is caught

```rx
import pure { fetch } from "./prelude"
component P(props: { children?: View }) {
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() {
  <P>{await fetch("q") catch (e) => "caught"}{await fetch("r")}</P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w | |
| 1 | reject "q" "no" | w | |
| 2 | reject "r" "no" | bad | |

## Variant: a stream

```rx
import pure { fetch } from "./prelude"
component P(props: { children?: View }) {
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() {
  <P>{await* fetch("q")}</P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w | |
| 1 | resolve "q" "1" | 1 | |
| 2 | resolve "q" "2" | 2 | |

## Variant: a first value

```rx
import pure { fetch } from "./prelude"
component P(props: { children?: View }) {
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() {
  <P>{await fetch("q") -> "first"}</P>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | first | |
| 1 | resolve "q" "1" | 1 | |

## Variant: in a row

```rx
import pure { fetch } from "./prelude"
component P(props: { children?: View }) {
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() {
  {for x in ["a", "b"] { <P>{await fetch(x)}</P> }}
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | ww | |
| 1 | resolve "b" "2" | w2 | |
| 2 | resolve "a" "1" | 12 | |
