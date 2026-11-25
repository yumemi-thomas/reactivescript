# S-view-6 — views as three libraries have them

Rules: RG-4c, RG-7b, R-1, ST-4.

A select whose parts show their state (Kobalte's `Select.Value`, its `as`); a router's `Link`, `MatchRoute` and `Await`
(TanStack's function children); a list that owns its loop, over rows of the caller's type.

## Program

```rx
type Option = { id: string; label: string }
context select: { picked: Option | null; open: boolean; pick: (o: Option) => void; toggle: () => void }
component Root(props: { options: Option[]; placeholder: string; item: (s: { option: Option; selected: boolean }) => View; children?: View }) {
  source picked: Option | null := null
  source open := false
  action pick(o: Option) { picked := o
    open := false }
  action toggle() { open := v => !v }
  provide select = { picked: picked, open: open, pick: pick, toggle: toggle }
  s0 = { pick: pick }
  <section>{props.children}{if open { <ul>{for o in props.options { <li onClick={() => { s0.pick(o) }}><props.item option={o} selected={picked?.id == o.id} /></li> }}</ul> }}</section>
}
component Value(props: { children: View | ((s: { label: string; has: boolean }) => View) }) {
  s = use select
  <span><props.children label={s.picked?.label ?? "-"} has={s.picked != null} /></span>
}
component Trigger(props: { disabled?: boolean; children?: View | ((s: { open: boolean }) => View); element?: (e: { attrs: any; open: boolean }) => View }) {
  { children: none, element: none2, ...rest } = props
  s = use select
  {if props.element { <props.element attrs={{ ...rest, "aria-expanded": s.open ? "true" : "false" }} open={s.open} /> } else { <button {...rest} onClick={() => { s.toggle() }}><props.children open={s.open} /></button> }}
}
export default component App() {
  source mark := "*"
  <Root placeholder="p" options={[{ id: "1", label: "one" }, { id: "2", label: "two" }]}>
    {view item (s) { <b>{s.option.label}{s.selected ? mark : ""}</b> }}
    <Value>{view (s) { {if s.has { <i>{s.label}{mark}</i> } else { <em>none</em> }} }}</Value>
    <Trigger>{view (s) { <u>{s.open ? "^" : "v"}</u> }}</Trigger>
    <Trigger>plain</Trigger>
    <Trigger>{view element (e) { <a {...e.attrs}>{e.open ? "O" : "C"}</a> }}</Trigger>
  </Root>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | nonevplainC |  |
| 1 | handler `open := true` | none^plainOonetwo |  |
| 2 | handler `pick({ id: "2", label: "two" })` | two*vplainC |  |
| 3 | handler `mark := "!"` | two!vplainC |  |
| 4 | handler `toggle()` | two!^plainOonetwo! |  |

## Variant: router

```rx
import pure { fetch } from "./prelude"
context router: { path: string; go: (p: string) => void }
component Router(props: { children?: View }) {
  source path := "/a/1"
  action go(p: string) { path := p }
  provide router = { path: path, go: go }
  <main>{props.children}</main>
}
component Link(props: { to: string; children: View | ((s: { isActive: boolean }) => View) }) {
  r = use router
  <a href={props.to}><props.children isActive={r.path == props.to} /></a>
}
component MatchRoute(props: { prefix: string; children: (m: { id: string }) => View }) {
  r = use router
  {if r.path.startsWith(props.prefix) { <props.children id={r.path.slice(len(props.prefix))} /> }}
}
component Await(props: { ask: string; children: (d: { value: string }) => View }) {
  x = await fetch(props.ask)
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children value={x} /> }} }}
}
export default component App() {
  source label := "L"
  <Router>
    <Link to="/a/1">{view (s) { <b>{label}{s.isActive ? "+" : "-"}</b> }}</Link><Link to="/b">plain</Link>
    <MatchRoute prefix="/a/">{view (m) { source seen := 0
      <p>id {m.id}{seen}</p> }}</MatchRoute>
    <Await ask="q">{view (d) { <p>{d.value}{label}</p> }}</Await>
  </Router>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | L+plainid 10w |  |
| 1 | handler `path := "/a/2"` | L-plainid 20w |  |
| 2 | resolve "q" "1" | L-plainid 201L |  |
| 3 | handler `seen := 4` | L-plainid 241L |  |
| 4 | handler `path := "/b"` | L-plain1L |  |
| 5 | handler `label := "M"` | M-plain1M |  |

## Variant: list

```rx
type Row = { id: number; name: string }
component List(props: { rows: Row[]; row: (r: { item: Row; index: number; toggle: () => void; open: boolean }) => View; empty?: () => View; children?: View }) {
  source open := 0
  <table>{if len(props.rows) > 0 { <tbody>{for x in props.rows { <tr><props.row item={x} index={props.rows.indexOf(x)} open={open == x.id} toggle={() => x.id} /></tr> }}</tbody> } else { <tbody><tr><td>{if props.empty { <props.empty /> } else { <i>-</i> }}</td></tr></tbody> }}</table>{props.children}
}
export default component App() {
  source rows: Row[] key id := [{ id: 1, name: "a" }, { id: 2, name: "b" }]
  source picked := 0
  <List rows={rows}>
    {view row (r) { source own := 0
      <td>{r.index}{r.item.name}{own}{r.open ? "o" : ""}</td><td><button onClick={() => { picked := r.item.id }}>{picked == r.item.id ? "*" : ""}</button></td> }}
    {view empty () { <b>none</b> }}
    <p>foot</p>
  </List>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 0a01b0foot |  |
| 1 | handler `open := 2` | 0a01b0ofoot |  |
| 2 | handler `picked := 1` | 0a0*1b0ofoot |  |
| 3 | handler `rows[1].name := "z"` | 0a0*1z0ofoot |  |
| 4 | handler `rows := [{ id: 2, name: "z" }]` | 0z0ofoot |  |
| 5 | handler `rows := []` | nonefoot |  |

## Rejected variants

The row has its type:

```rx
-- types: TS2339
type Row = { id: number; name: string }
component List(props: { rows: Row[]; row: (r: { item: Row; index: number; toggle: () => void; open: boolean }) => View; empty?: () => View; children?: View }) {
  source open := 0
  <table>{if len(props.rows) > 0 { <tbody>{for x in props.rows { <tr><props.row item={x} index={props.rows.indexOf(x)} open={open == x.id} toggle={() => x.id} /></tr> }}</tbody> } else { <tbody><tr><td>{if props.empty { <props.empty /> } else { <i>-</i> }}</td></tr></tbody> }}</table>{props.children}
}
export default component App() {
  source rows: Row[] key id := [{ id: 1, name: "a" }, { id: 2, name: "b" }]
  source picked := 0
  <List rows={rows}>
    {view row (r) { source own := 0
      <td>{r.index}{r.item.nmae}{own}{r.open ? "o" : ""}</td><td><button onClick={() => { picked := r.item.id }}>{picked == r.item.id ? "*" : ""}</button></td> }}
    {view empty () { <b>none</b> }}
    <p>foot</p>
  </List>
}
```

```rx
-- reject: CONTENT_MODEL
type Row = { id: number; name: string }
component List(props: { rows: Row[]; row: (r: { item: Row; index: number; toggle: () => void; open: boolean }) => View; empty?: () => View; children?: View }) {
  source open := 0
  <table>{if len(props.rows) > 0 { <tbody>{for x in props.rows { <tr><props.row item={x} index={props.rows.indexOf(x)} open={open == x.id} toggle={() => x.id} /></tr> }}</tbody> } else { <tbody><tr><td>{if props.empty { <props.empty /> } else { <i>-</i> }}</td></tr></tbody> }}</table>{props.children}
}
export default component App() {
  source rows: Row[] key id := [{ id: 1, name: "a" }, { id: 2, name: "b" }]
  source picked := 0
  <List rows={rows}>
    {view row (r) { source own := 0
      <p>x</p><td>{r.index}{r.item.name}{own}{r.open ? "o" : ""}</td><td><button onClick={() => { picked := r.item.id }}>{picked == r.item.id ? "*" : ""}</button></td> }}
    {view empty () { <b>none</b> }}
    <p>foot</p>
  </List>
}
```
