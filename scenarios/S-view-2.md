# S-view-2 — a closure as a component's children

Rules: RG-4c (a function prop), E-2.

Children that are one closure are what `props.children(…)` calls, where the component calls them: live in what the closure
reads and in what it is called with. The interpreter and the oracle threw (proposals/bugs/34).

## Modules

```rx
-- module: ./t.rx
export component T(props: { children: (n: number) => string }) {
  source n := 1
  <b>{props.children(n)}</b>
}
```

## Program

```rx
component T(props: { children: (n: number) => string }) {
  source n := 1
  <b>{props.children(n)}</b>
}
export default component App() {
  source m := "a"
  <T>{n => m + n}</T>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |
| 1 | handler `n := 2` | a2 |  |
| 2 | handler `m := "b"` | b2 |  |

## Variant: given on

```rx
component T(props: { children: (n: number) => string }) {
  source n := 1
  <b>{props.children(n)}</b>
}
component O(q: { children: (n: number) => string }) { <T>{q.children}</T> }
export default component App() {
  source m := "a"
  <O>{n => m + n}</O>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |
| 1 | handler `n := 2` | a2 |  |
| 2 | handler `m := "b"` | b2 |  |

## Variant: given on, called by another

```rx
component T(props: { children: (n: number) => string }) {
  source n := 1
  <b>{props.children(n)}</b>
}
component O(q: { children: (n: number) => string }) { <T>{n => q.children(n)}</T> }
export default component App() {
  source m := "a"
  <O>{n => m + n}</O>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |
| 1 | handler `n := 2` | a2 |  |
| 2 | handler `m := "b"` | b2 |  |

## Variant: one of two

```rx
component T(props: { children: (n: number) => string }) {
  source n := 1
  <b>{props.children(n)}</b>
}
export default component App() {
  source m := "a"
  source k := true
  <T>{k ? n => m + n : n => "x" + n}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |
| 1 | handler `n := 2` | a2 |  |
| 2 | handler `m := "b"` | b2 |  |
| 3 | handler `k := false` | x2 |  |

## Variant: called by an equation

```rx
component T(props: { children: (n: number) => string }) {
  source n := 1
  x = props.children(n)
  <b>{x}</b>
}
export default component App() {
  source m := "a"
  <T>{n => m + n}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |
| 1 | handler `n := 2` | a2 |  |
| 2 | handler `m := "b"` | b2 |  |

## Variant: under a name

```rx
component T(props: { children: (n: number) => string }) {
  source n := 1
  <b>{props.children(n)}</b>
}
export default component App() {
  source m := "a"
  f = n => m + n
  <T>{f}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |
| 1 | handler `n := 2` | a2 |  |
| 2 | handler `m := "b"` | b2 |  |

## Variant: called twice

```rx
component T(props: { children: (n: number) => string }) {
  source n := 1
  <b>{props.children(n)}{props.children(n)}</b>
}
export default component App() {
  source m := "a"
  <T>{n => m + n}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1a1 |  |
| 1 | handler `n := 2` | a2a2 |  |

## Variant: called in a branch

```rx
component T(props: { children: (n: number) => string }) {
  source n := 1
  {if n > 1 { <b>{props.children(n)}</b> }}
}
export default component App() {
  source m := "a"
  <T>{n => m + n}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount |  |  |
| 1 | handler `n := 2` | a2 |  |
| 2 | handler `m := "b"` | b2 |  |

## Variant: called in a loop

```rx
component T(props: { xs: number[], children: (n: number) => string }) { {for x in props.xs { <i>{props.children(x)}</i> }} }
export default component App() {
  source m := "a"
  <T xs={[1, 2]}>{n => m + n}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1a2 |  |
| 1 | handler `m := "b"` | b1b2 |  |

## Variant: taken out of the props

```rx
component T({ children }: { children: (n: number) => string }) { <b>{children(1)}</b> }
export default component App() {
  source m := "a"
  <T>{n => m + n}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |
| 1 | handler `m := "b"` | b1 |  |

## Variant: called by an effect

```rx
component T(props: { children: (n: number) => string }) { source n := 1
  effect (props.children(n)) { log($0) }
 <i /> }
export default component App() {
  source m := "a"
  <T>{n => m + n}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount |  | log(a1) |
| 1 | handler `n := 2` |  | log(a2) |

## Variant: answering a record

```rx
component T(props: { children: (n: number) => { k: string } }) {
  source n := 1
  <b>{props.children(n).k}</b>
}
export default component App() {
  source m := "a"
  <T>{n => ({ k: m + n })}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |
| 1 | handler `n := 2` | a2 |  |
| 2 | handler `m := "b"` | b2 |  |

## Variant: with state of its block

```rx
component T(props: { children: (n: number) => string }) {
  source n := 1
  <b>{props.children(n)}</b>
}
export default component App() {
  source m := "a"
  {if true { source z := "z"
  <T>{n => z + n}</T> }}
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | z1 |  |
| 1 | handler `z := "y"` | y1 |  |
| 2 | handler `n := 3` | y3 |  |

## Variant: given a closure

```rx
component T(props: { children: (n: () => number) => string }) {
  source n := 1
  <b>{props.children(() => n)}</b>
}
export default component App() {
  source m := "a"
  <T>{g => m + g()}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |
| 1 | handler `n := 2` | a2 |  |
| 2 | handler `m := "b"` | b2 |  |

## Variant: of another module

```rx
import { T } from "./t.rx"
export default component App() {
  source m := "a"
  <T>{n => m + n}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |
| 1 | handler `n := 2` | a2 |  |
| 2 | handler `m := "b"` | b2 |  |
