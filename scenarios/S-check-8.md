# S-check-8 — children nobody declares are a view

Rules exercised: RG-4c.

"A view is only shown" was held by the receiver's declared type, so a component that declared nothing of its children
received anything: `component P(props: { children: any }) { <b>{str(props.children)}</b> }` was accepted, the interpreter
showed `#error` and compiled code threw; and a component with no props type that asked `if props.children` and then
showed them failed to hydrate when the caller gave markup (the roadmap's W4, 2026-11-26). Where the module's own text
says nothing of them — no props type, props `any` or `unknown`, `children: any` or `unknown` — children are what a
caller writes between the tags: a view, `children?: View`, for the checkers and for every runner. A spread of the whole
props on an element is not a giving-on of them. A type the checkers do not read (an alias imported from JavaScript) is
as it was.

## Program

```rx
component Plain(props) {
  <b>{if props.children { <i>{props.children}</i> } else { <u>none</u> }}</b>
}
component Loose(props: { children: any; n?: number }) { <em>{props.children}</em> }
component Field(props: any) { <input {...props} /> }
export default component App() {
  source on := true
  <Plain><s>y</s></Plain>
  <Plain />
  <Loose>{on ? "on" : "off"}</Loose>
  <Field value="v" />
  <button onClick={() => { on := !on }}>t</button>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `ynoneont` |
| 1 | handler `on := false` | `ynoneofft` |

## Rejected variants

```rx
-- reject: VIEW_NOT_SHOWN
component P(props: { children: any }) { <b>{str(props.children)}</b> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
component P(props) {
  c = props.children
  <b>{str(c)}</b>
}
export default component App() { <P><i>x</i></P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
fn keep(x: any) => [x]
component P(props: unknown) { <b>{len(keep(props.children))}</b> }
export default component App() { <P>x</P> }
```

```rx
-- reject: VIEW_NOT_SHOWN
component P(props: { children?: any }) { <b>{props.children == "x" ? "same" : "other"}</b> }
export default component App() { <P>x</P> }
```
