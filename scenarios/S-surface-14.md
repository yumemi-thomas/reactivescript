# S-surface-14 — a quoted key in a pattern, `on` and `from` as names, an action's optional parameter

Rules exercised: RG-4b, AC-1f, E-9a, 07 §1.

Three things a library written in `.rx` kept meeting. A prop whose name is no identifier (`aria-label`, `data-k`) is
taken out of the props by its string, bound to a name, and the rest is without it. `on` and `from` are words only where
the grammar reads them (`loading on (…)`, `import … from`): a prop, an equation or a local may be so named. An
action's last parameters may be left out, marked `?` as a fn's are: a call passes the required ones and any of the
rest.

## Program

```rx
component Part(props: { "aria-label"?: string; "data-k"?: string; from?: string; children?: View }) {
  { "aria-label": label = "none", "data-k": k, from, ...rest } = props
  on = label != "none"
  <div title={label} {...rest}>{label}{on ? "+" : "-"}{k ?? "."}{from ?? "?"}{props.children}</div>
}
export default component App() {
  source a := "A"
  source n := 0
  action bump(to: number, by?: number) { n := to + (by ?? 1) }
  <Part aria-label={a} from="f">x</Part><Part data-k="K">y</Part><i onClick={() => { bump(1) }}>{n}</i>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `A+.fxnone-K?y0` |
| 1 | handler `bump(1)` | `A+.fxnone-K?y2` |
| 2 | handler `bump(1, 5)` | `A+.fxnone-K?y6` |
| 3 | handler `a := "B"` | `B+.fxnone-K?y6` |

## Rejected variants

```rx
-- reject: ARGUMENT_COUNT
export default component App() {
  source n := 0
  action bump(to: number, by?: number) { n := to + (by ?? 1) }
  <i onClick={() => { bump() }}>{n}</i>
}
```

The required one is still passed, and no more than are declared (`bump(1, 2, 3)`).

```rx
-- reject: PARSE
export default component App() {
  r = { "aria-label": "x" }
  { "aria-label" } = r
  <i>x</i>
}
```

A key that is no name binds nothing by itself: `{ "aria-label": label }`.

```rx
-- reject: PARSE
fn twice(ref x: number): ref number => x * 2
export default component App() { source n := 1
  <i>{twice(n)}</i> }
```

`ref` before a result's type is a declaration's word (a JavaScript fn's row, a printed signature): a fn written in
`.rx` answers a value, and what it reads through a `ref` parameter its caller reads. Both checkers took it, and the
type layer then failed on the text (`TS1144`).

```rx
-- types: TS2345
export default component App() {
  source n := 0
  action bump(to: number, by?: number) { n := to + (by ?? 1) }
  <i onClick={() => { bump(1, "two") }}>{n}</i>
}
```
