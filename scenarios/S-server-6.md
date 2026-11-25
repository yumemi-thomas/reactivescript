# S-server-6 — a value shown in a table is text

Rules exercised: SV-7d, RG-4c.

A value written in a view, `{n}`, is shown as its text. Directly inside a `<table>`, `<thead>`, `<tbody>`, `<tfoot>` or
`<tr>` the browser's parser moves text out, before the table (foster parenting): the served page is then not the tree the
client builds. Text written there was refused; a value shown there was not, whether written in place, given as content,
in a view with a parameter, through a context that holds a view, or as a component's root (found as the text of an
explicit view in a `<tbody>`; the same on upstream for `<tbody>{n}</tbody>`). It is `CONTENT_MODEL` now, in both checkers.

What is shown there and is no value stays: a view the component was given (its children, a prop declared `View`, under
whatever name; a field of a view's parameter declared `View`), a view a context holds, a loop, a choice of the
component's views. A field of the props whose type is not read is as it was.

## Program

```rx
component T(p: { row: (r: { i: number }) => View }) { <table><tbody><tr><td>a</td></tr><p.row i={1} /></tbody></table> }
export default component App() { <T>{view row (r) { <tr><td>{r.i}</td></tr> }}</T> }
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a1` |

## Variant: rows as children, under a name

```rx
component T(p: { children: View }) { rows = p.children
  <table><tbody>{rows}</tbody></table> }
export default component App() { <T><tr><td>a</td></tr></T> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a` |

## Variant: a choice of the component's views

```rx
component T(p: { a: View; b: View; on: boolean }) { <table><tbody>{p.on ? p.a : p.b}</tbody></table> }
component O(p: { on: boolean; children: View }) { <T on={p.on} a={p.children} b={p.children} /> }
export default component App() { source on := true
  <O on={on}><tr><td>a</td></tr></O> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a` |

## Variant: a view among what a view is shown with

```rx
component T(p: { row: (r: { cells: View }) => View; cells: View }) { <table><tbody><p.row cells={p.cells} /></tbody></table> }
component O(p: { children: View }) { <T cells={p.children}>{view row (r) { <tr>{r.cells}</tr> }}</T> }
export default component App() { <O><td>c</td></O> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `c` |

## Variant: a value in a cell

```rx
component T(p: { cell: (r: { i: number }) => View }) { <table><tbody><tr><td><b>a</b><p.cell i={1} /></td></tr></tbody></table> }
export default component App() { source n := 1
  <T>{view cell (q) { {n} }}</T> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `a1` |
| 1 | handler `n := 2` | `a2` |

## Variant: a component whose root is a value, in a cell

```rx
component Cell(p: { v: number }) { {p.v} }
export default component App() { <table><tbody><tr><td><Cell v={1} /></td></tr></tbody></table> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `1` |

## Rejected variants

Written in place.

```rx
-- reject: CONTENT_MODEL
export default component App() { source n := 1
  <table><tbody><tr><td>a</td></tr>{n}</tbody></table> }
```

Given as content.

```rx
-- reject: CONTENT_MODEL
component T(p: { children: View }) { <table><tbody><tr><td>a</td></tr>{p.children}</tbody></table> }
export default component App() { 
  <T>{"t"}</T> }
```

In a view with a parameter.

```rx
-- reject: CONTENT_MODEL
component T(p: { cell: (r: { i: number }) => View }) { <table><tbody><tr><td>a</td></tr><p.cell i={1} /></tbody></table> }
export default component App() { source n := 1
  <T>{view cell (q) { {n} }}</T> }
```

A field of the view's parameter that is a value's.

```rx
-- reject: CONTENT_MODEL
component T(p: { row: (r: { i: number }) => View }) { <table><tbody><p.row i={1} /></tbody></table> }
export default component App() { <T>{view row (r) { {r.i} }}</T> }
```

Through a context that holds a view.

```rx
-- reject: CONTENT_MODEL
context cell: View
component T(p: { cell: View; children: View }) { provide cell = p.cell
  <div>{p.children}</div> }
component B() { <table><tbody><tr><td>a</td></tr>{use cell}</tbody></table> }
component V(p: { v: string }) { {p.v} }
export default component App() { source n := 1
  <T cell={n}><B /></T> }
```

As a component's root.

```rx
-- reject: CONTENT_MODEL
component X(p: { v: string }) { {p.v} }
export default component App() { source n := 1
  <table><tbody><tr><td>a</td><X v={str(n)} /></tr></tbody></table> }
```

```rx
-- reject: CONTENT_MODEL
export default component App() { source n := 1
  <table><tbody><tr><td>a</td></tr></tbody>{`v${n}`}</table> }
```

```rx
-- reject: CONTENT_MODEL
export default component App() { source on := true
  <table><thead><tr><th>a</th></tr>{on ? "y" : "n"}</thead></table> }
```

A value that may be `undefined` is shown as that word.

```rx
-- reject: CONTENT_MODEL
export default component App() { source u: string | undefined := undefined
  <table><tfoot><tr><td>a</td></tr>{u}</tfoot></table> }
```

```rx
-- reject: CONTENT_MODEL
component T(p: { label: string }) { <table><tbody><tr>{p.label}</tr></tbody></table> }
export default component App() { <T label="x" /> }
```

A type parameter is a value's type.

```rx
-- reject: CONTENT_MODEL
component T<V>(p: { v: V }) { <table><tbody><tr>{p.v}</tr></tbody></table> }
export default component App() { <T v={1} /> }
```

```rx
-- reject: CONTENT_MODEL
export default component App() { source on := true
  <table><tbody>{if on { <tr><td>a</td></tr> } else { {"none"} }}</tbody></table> }
```

```rx
-- reject: CONTENT_MODEL
export default component App() { source xs := [1, 2]
  <table><tbody>{for x in xs { {x} }}</tbody></table> }
```
