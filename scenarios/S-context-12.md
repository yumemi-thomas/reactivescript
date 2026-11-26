# S-context-12 — a component that hands its props on: its children are under what the other provides

Rules exercised: RG-7b, MO-3, 07 §4 (a spread).

`<Root {...props} />` gives every field of the props to `Root` under its own name: the children of `Progress` are
`Root`'s children, and are under what `Root` provides to its children. A summary names such a field where it goes
somewhere the spread as a whole does not (`children: provides(…)` beside `...props`), so an importer of the printed
signature reads the same. Both checkers took the spread as one field that goes wherever any of `Root`'s goes, and
refused the reader below (`CONTEXT_NOT_FOUND`), in one module and through a signature.

## Modules

```rx
-- module: ./meter.rx
context meter: number
export type P = { value?: number; title?: string; children?: View }
export component Root(props: P) {
  { value = 0, children, ...rest } = props
  provide meter = value
  <div {...rest}>{children}</div>
}
export component Progress(props: P) { <Root {...props} title="progress" /> }
export component Twice(props: P) { <Progress {...props} /> }
export component Shown() { <i>{use meter}</i> }
```

## Program

```rx
import { Progress, Twice, Shown } from "./meter.rx"
export default component App() {
  source v := 1
  <section><Progress value={v}><Shown /></Progress><Twice value={v + 1}><Shown /></Twice></section>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `12` |
| 1 | handler `v := 5` | `56` |

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
context meter: number
type P = { value?: number; children?: View }
component Root(props: P) {
  <div>{props.children}{if true { provide meter = props.value ?? 0
    <b>.</b> }}</div>
}
component Progress(props: P) { <Root {...props} /> }
component Shown() { <i>{use meter}</i> }
export default component App() { <section><Progress value={1}><Shown /></Progress></section> }
```

The children are beside what `Root` provides, not under it.

```rx
-- reject: CONTEXT_NOT_FOUND
context meter: number
type P = { value?: number; children?: View }
component Root(props: P) {
  provide meter = props.value ?? 0
  <div>{props.children}</div>
}
component Progress(props: P) {
  { children, ...rest } = props
  <Root {...rest} /><u>{children}</u>
}
component Shown() { <i>{use meter}</i> }
export default component App() { <section><Progress value={1}><Shown /></Progress></section> }
```

The children were taken out of what is handed on, and are shown outside `Root`.
