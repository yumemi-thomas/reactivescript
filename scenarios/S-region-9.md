# S-region-9 — children that are a value (RG-4c)

Rules exercised: RG-4c, 07 §4.

Children declared a value's type that is read are the value written between the tags; so are children nobody declares, in
a component the module does not export, that uses them as a value where every caller gives one. A spread of the whole
props onto an element gives its children on, as Solid's spread does.

## Program

```rx
component Count(props: { children: number[] }) { <b>{len(props.children)}</b> }
component Each(props) { <i>{props.children(2)}</i> }
component Label(props) { <u title={props.children}>x</u> }
component Panel(props) { <div {...props} /> }
export default component App() {
  source n := 1
  <Count>{[1, n]}</Count><Each>{(x: number) => x * n}</Each><Label>hi</Label><Panel class="c">t{n}</Panel>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `22xt1` |
| 1 | handler `n := 3` | `26xt3` |

## Rejected variants

A caller that gives markup: the children are a view, and a view is only shown.

```rx
-- reject: VIEW_NOT_SHOWN
component Each(props) { <i>{props.children(2)}</i> }
export default component App() {
  source n := 1
  <Each>{(x: number) => x * n}</Each><Each><b>x</b></Each>
}
```

An exported component: its callers are not all seen, so it says what its children are.

```rx
-- reject: VIEW_NOT_SHOWN
export component Each(props) { <i>{props.children(2)}</i> }
export default component App() {
  source n := 1
  <Each>{(x: number) => x * n}</Each>
}
```
