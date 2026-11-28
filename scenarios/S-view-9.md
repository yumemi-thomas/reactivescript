# S-view-9 — a prop named by a string, in a component that is given a view

Rules exercised: RG-4c.

`props["aria-label"]` names one prop, as `props.label` does: it is no mention of the views the component is given. A
string that names a view is that view.

## Program

```rx
context row: (p: { n: number }) => View
component L() { <p><use.row n={1} /></p> }
component R(props: { row: (p: { n: number }) => View; "aria-label"?: string; children?: View }) {
  provide row = props.row
  <div title={props["aria-label"] ?? "none"}>{props["aria-label"] ?? "none"}{props.children}</div>
}
export default component App() {
  source label := "A"
  <R aria-label={label}>{view row (p) { <b>{p.n}</b> }}<L /></R>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `A1` |
| 1 | handler `label := "B"` | `B1` |

## Rejected variants

```rx
-- reject: VIEW_FN_MISPLACED
component R(props: { row: (p: { n: number }) => View }) { x = props["row"]
  <p>{str(x)}<props.row n={1} /></p> }
export default component App() { <R>{view row (p) { <b>{p.n}</b> }}</R> }
```

```rx
-- reject: VIEW_NOT_SHOWN
component R(props: { side: View }) { x = str(props["side"])
  <p>{x}</p> }
export default component App() { <R side="s" /> }
```
