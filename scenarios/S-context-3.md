# S-context-3 — a view a component is given, and what a region provides

Rules: RG-4b, RG-4c, RG-7a, RG-7b, R-f-5, E-1, SV-3.

`{ children } = props` is a projection of the props, as `props.children` is:
the view is made where it is read, under what is provided and caught there.
(Compiled, it was an equation, which made the view at once, above the
component's `provide`, whether or not anything read it.)

## Program

```rx
context c: string = "none"
type Parts = { header?: View; children?: View }
component Seen(props: { label: string }) {
  effect () { log(props.label) }
  <b>{props.label}:{use c}/</b> }
component Named(props: { children?: View }) {
  { children } = props
  provide c = "named"
  <i>{children}</i>
}
component Pattern({ children: kids, ...rest }: { children?: View, label: string }) {
  provide c = rest.label
  <i>{kids}</i>
}
component Rest(props: Parts) {
  { header, ...others } = props
  mine = others.children
  provide c = "rest"
  <i>{mine}{header ?? "-"}</i>
}
component Dflt({ children = "nothing" }: { children?: View }) {
  provide c = "dflt"
  <i>{children}</i>
}
component Unused(props: { children?: View }) {
  { children } = props
  <i>-</i>
}
component Shown(props: { children?: View }) {
  { children } = props
  {if children { <i>{children}</i> }}
}
component Caught(props: { children?: View }) {
  { children } = props
  <i>{errored fallback(e) { <u>caught</u> } { {children} }}</i>
}
component Boom() { x = await fetch("no")
  <b>{x}</b> }
export default component App() {
  source lit := true
  <p><Named><Seen label="a" /></Named><Pattern label="p"><Seen label="b" /></Pattern><Rest><Seen label="r" /></Rest><Dflt><Seen label="d" /></Dflt></p>
  <p><Unused><Seen label="never" /></Unused><Shown><Seen label="s" /></Shown></p>
  <p>{if lit { <Named><Seen label="l" /></Named> }}<Named>text {lit}</Named></p>
  <p>{loading fallback { <u>wait</u> } { <Caught><Boom /></Caught> }}</p>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `a:named/b:p/r:rest/-d:dflt/-s:none/l:named/text truewait` | log(a); log(b); log(r); log(d); log(s); log(l) |
| 1 | reject "no" "down" | `a:named/b:p/r:rest/-d:dflt/-s:none/l:named/text truecaught` |  |
| 2 | handler `lit := false` | `a:named/b:p/r:rest/-d:dflt/-s:none/text falsecaught` |  |
| 3 | handler `lit := true` | `a:named/b:p/r:rest/-d:dflt/-s:none/l:named/text truecaught` | log(l) |

## Variant: what a region provides is for what is in it

A component beside it, the branch that takes its place, and what comes after
see what is above. (Compiled, a component has no owner in Solid's production
build, and the two branches of an `if` have their condition's: the first was
seen beside it, the second by the branch that followed.)

```rx
context c: string = "none"
component Seen(props: { label: string }) { <b>{props.label}:{use c}/</b> }
component Prov(props: { label: string }) { provide c = props.label
  <Seen label="in" /> }
export default component App() {
  source lit := true
  <p><Prov label="one" /><Seen label="beside" /></p>
  <p>{if lit { provide c = "branch"
    <Seen label="t" /> } else { <Seen label="f" /> }}{if lit { <Seen label="t2" /> } else { provide c = "else"
    <Seen label="f2" /> }}</p>
  <p>{for x in [1, 2] { provide c = `row${x}`
    <Seen label="r" /> }}<Seen label="after" /></p>
  <p>{loading fallback { <u>wait</u> } { provide c = "load"
    <Seen label="l" /> }}<Seen label="after" /></p>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `in:one/beside:none/t:branch/t2:none/r:row1/r:row2/after:none/l:load/after:none/` |  |
| 1 | handler `lit := false` | `in:one/beside:none/f:none/f2:else/r:row1/r:row2/after:none/l:load/after:none/` |  |
| 2 | handler `lit := true` | `in:one/beside:none/t:branch/t2:none/r:row1/r:row2/after:none/l:load/after:none/` |  |
