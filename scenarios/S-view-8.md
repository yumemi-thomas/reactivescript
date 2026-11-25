# S-view-8 — a tag chosen by a value, with what exists

Rules exercised: RG-4c, SV-7d, MO-11k, TY-2.

`.rx` has no element whose tag is a value (Solid's `Dynamic`, a library's `as`). Two forms that exist stand for it, and
both are held here in every runner, served and hydrated. A closed set of tags is an `if` over a prop typed by its
literals: each branch is an element the checkers know, so the content model is held for each. A tag or a component the
*caller* chooses is `render`: the part shows a view with the attributes it owns (state, handlers, ARIA), and the caller
spreads them on its own element or component.

## Modules

```rx
-- module: ./lib.rx
export component Trigger(props: { render: (p: { attrs: { "aria-expanded": "true" | "false"; onClick: () => void; class: string }; open: boolean }) => View }) {
  source open := false
  action toggle() { open := !open }
  <props.render attrs={{ "aria-expanded": open ? "true" : "false", onClick: toggle, class: open ? "on" : "off" }} open={open} />{open ? "+" : "-"}
}
```

## Program

```rx
import { Trigger } from "./lib.rx"
component Link(props: { to: string; class?: string; children: View }) {
  { to, children, ...rest } = props
  <a href={to} {...rest}>{children}</a>
}
export default component App() {
  source label := "go"
  source kept := null
  <Trigger>{view render (p) { <Link to="/x" {...p.attrs}><span>go</span></Link> }}</Trigger>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `go-` |
| 1 | handler `label := "went"` | `go-` |

## Variant: a closed set of tags, `as: "button" | "a"`, that changes

```rx
component Trigger(props: { as: "button" | "a"; href?: string; children: View }) {
  source open := false
  action toggle() { open := !open }
  {if props.as == "a" { <a href={props.href} aria-expanded={open ? "true" : "false"} onClick={toggle}>{props.children}</a> } else { <button aria-expanded={open ? "true" : "false"} onClick={toggle}>{props.children}</button> }}{open ? "+" : "-"}
}
export default component App() {
  source label := "go"
  source kept := null
  source k: "button" | "a" := "button"
  <Trigger as={k} href="/x"><span>go</span></Trigger>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `go-` |
| 1 | handler `k := "a"` | `go-` |
| 2 | handler `label := "went"` | `go-` |

## Variant: a heading's level

```rx
component Heading(props: { level: 1 | 2 | 3; class?: string; children: View }) {
  {if props.level == 1 { <h1 class={props.class}>{props.children}</h1> } else { {if props.level == 2 { <h2 class={props.class}>{props.children}</h2> } else { <h3 class={props.class}>{props.children}</h3> }} }}
}
export default component App() {
  source label := "go"
  source kept := null
  source lv: 1 | 2 | 3 := 3
  <Heading level={lv} class="t">go</Heading>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `go` |
| 1 | handler `lv := 2` | `go` |
| 2 | handler `label := "went"` | `go` |

## Variant: `render` is optional: the part's own element where none is given

```rx
component Trigger(props: { render?: (p: { attrs: { "aria-expanded": "true" | "false"; onClick: () => void; class: string }; open: boolean }) => View; children?: View }) {
  source open := false
  action toggle() { open := !open }
  {if props.render { <props.render attrs={{ "aria-expanded": open ? "true" : "false", onClick: toggle, class: open ? "on" : "off" }} open={open} /> } else { <button aria-expanded={open ? "true" : "false"} onClick={toggle} class={open ? "on" : "off"}>{props.children}</button> }}{open ? "+" : "-"}
}
export default component App() {
  source label := "go"
  source kept := null
  <Trigger>{view render (p) { {if p.open { <b {...p.attrs}>go!</b> } else { <i {...p.attrs}>go</i> }} }}</Trigger>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `go-` |
| 1 | handler `label := "went"` | `go-` |

## Variant: the part reads its root's context; the caller's component takes the attributes

```rx
context menu: { open: boolean; toggle: () => void } = { open: false, toggle: () => undefined }
component Root(props: { children: View }) {
  source open := false
  action toggle() { open := !open }
  provide menu = { open: open, toggle: toggle }
  <div>{props.children}{open ? "+" : "-"}</div>
}
component Trigger(props: { render: (p: { attrs: { "aria-expanded": "true" | "false"; onClick: () => void; class: string }; open: boolean }) => View }) {
  m = use menu
  <props.render attrs={{ "aria-expanded": m.open ? "true" : "false", onClick: m.toggle, class: m.open ? "on" : "off" }} open={m.open} />
}
component Link(props: { to: string; class?: string; children: View }) {
  { to, children, ...rest } = props
  <a href={to} {...rest}>{children}</a>
}
export default component App() {
  source label := "go"
  source kept := null
  <Root><Trigger>{view render (p) { <Link to="/x" {...p.attrs}>go</Link> }}</Trigger></Root>
}
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `go-` |
| 1 | handler `label := "went"` | `go-` |

## Variant: the view is shown twice: each place has its own state

```rx
component T(props: { render: (p: { attrs: { class: string } }) => View }) { <div><props.render attrs={{ class: "a" }} /><props.render attrs={{ class: "b" }} /></div> }
export default component App() { <T>{view render (p) { source n := 0
  <i {...p.attrs} onClick={() => { n := n + 1 }}>{n}</i> }}</T> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `00` |

## Variant: a part that hands its `render` on

```rx
component T(props: { render: (p: { attrs: { class: string } }) => View }) { <props.render attrs={{ class: "a" }} /> }
component Outer(props: { render: (p: { attrs: { class: string } }) => View }) { <T>{view render (p) { <props.render attrs={p.attrs} /> }}</T> }
export default component App() { <Outer>{view render (p) { <b {...p.attrs}>x</b> }}</Outer> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `x` |

## Variant: a view among what the part gives

```rx
component T(props: { render: (p: { attrs: { class: string }; icon: View }) => View; icon: View }) { <props.render attrs={{ class: "x" }} icon={props.icon} /> }
export default component App() { <T icon={"i"}>{view render (p) { <a {...p.attrs}>{p.icon}</a> }}</T> }
```

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `i` |

## Rejected variants

Each branch is held: the caller's `<div>` may be shown in a `<p>`. A set whose tags take the same content (`div`, `section`; `h1` to `h6`; `ul`, `ol`) refuses nothing.

```rx
-- reject: CONTENT_MODEL
component Box(props: { as: "div" | "p"; children: View }) { {if props.as == "p" { <p>{props.children}</p> } else { <div>{props.children}</div> }} }
export default component App() { <Box as="div"><div>block</div></Box> }
```

What the caller renders is placed where the part shows it.

```rx
-- reject: CONTENT_MODEL
component T(props: { render: (p: { attrs: { id: string } }) => View }) { <p><props.render attrs={{ id: "t1" }} /></p> }
export default component App() { <T>{view render (p) { <div {...p.attrs}>x</div> }}</T> }
```

```rx
-- types: TS2322
component Trigger(props: { as: "button" | "a"; href?: string; children: View }) {
  source open := false
  action toggle() { open := !open }
  {if props.as == "a" { <a href={props.href} aria-expanded={open ? "true" : "false"} onClick={toggle}>{props.children}</a> } else { <button aria-expanded={open ? "true" : "false"} onClick={toggle}>{props.children}</button> }}{open ? "+" : "-"}
}
export default component App() {
  source label := "go"
  source kept := null
  <Trigger as="div">x</Trigger>
}
```

```rx
-- types: TS2551
component Trigger(props: { render: (p: { attrs: { "aria-expanded": "true" | "false"; onClick: () => void; class: string }; open: boolean }) => View }) {
  source open := false
  action toggle() { open := !open }
  <props.render attrs={{ "aria-expanded": open ? "true" : "false", onClick: toggle, class: open ? "on" : "off" }} open={open} />{open ? "+" : "-"}
}
export default component App() {
  source label := "go"
  source kept := null
  <Trigger>{view render (p) { <a href="/x" {...p.atrs}>go</a> }}</Trigger>
}
```
