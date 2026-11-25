# Children kept in a record are made above what the component provides

<!-- frames branch=fail upstream=fail -->
```rx
context c: string
component Seen() { <b>{use c}</b> }
component O(props: { children: View }) {
  r = { v: props.children }
  provide c = "given"
  <div>{r.v}</div>
}
export default component App() { <O><Seen /></O> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `given` |

Accepted; compiled, it throws `no provision for c`; the interpreter shows `given`. A record is a memo, and reads its fields when it is made: what [29](29-destructured-children.md) is for a projection. A spread does it too, and hides it: `provide part = { ...rest, title: t }` where `rest` still holds `children` (met twice in an hour of writing `asChild`; `{ children, ...rest } = props` is the way round).

**Not fixed.** RG-4b's projection holds a view and is no computation; that a record is none either is written nowhere upstream. Both checkers would have to place a view that is in a value where it is made, or refuse it there.
