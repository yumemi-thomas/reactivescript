# S-view-4 — a view shown by another module's component

Rules: RG-4c, MO-3, MO-9, MO-11c, O-3, CN-4b.

What an importer is checked against is the component's signature: where its view is (`catches`, `provides`, the content
model), `view`, its parameter's type, and which of its fields hold no closure of the component's, `value(…)`.

## Modules

```rx
-- module: ./t.rx
export context c: string
export component Toggle(props: { children: (s: { id: string, onGo: () => void, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  provide c = "in"
  <p><props.children id={str(n)} onGo={() => { n := v => v + 1 }} go={bump} /></p>
}
export component Opt(props: { children?: () => View }) {
  {if props.children { <props.children /> } else { <i>d</i> }}
}
export component Held(props: { children: (s: { k: string }) => View }) {
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children k="q" /> }} }}
}
export component Many(props: { children: (s: { n: number, go: () => void, row: any }) => View }) {
  source n := 1
  source xs := [{ id: 1 }]
  {for r in xs { <props.children n={n} go={() => n} row={r} /> }}
}
export component W(props: { children: (s: { n: number }) => View }) { <Many>{view (s) { <props.children n={s.n} /> }}</Many> }
export component Para(props: { children: () => View }) { <p><props.children /></p> }
export component Arr(props: { children: (s: { xs: number[], f: (a: { b: 1 }) => void }) => View }) { source xs := [1]
  <props.children xs={xs} f={(a) => 1} /> }
```

```rx
-- module: ./j.d.rx
export component Panel(props: { as: Component; children?: View })
export component List(props: { items: any[]; children: (x: any) => View })
export fn mk(x: any): Component
export pure fn useQ(): { data: pending fails(Error) ref string; label: string }
```

```rx
-- module: ./cl.d.rx
export client pure fn where(): Promise<string>
```

## Program

```rx
import { Toggle, Opt, c } from "./t.rx"
export default component App() {
  source picked := "-"
  <Toggle>{view (s) { <button onClick={() => { picked := s.id
    s.onGo() }}>{s.id}{picked}{use c}</button> }}</Toggle>
  <Opt /><Opt>{view () { <b>v</b> }}</Opt>
}
```

## Frames

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | 1-indv |
| 1 | handler `bump()` | 2-indv |

## Before hydration

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | 1-indv |
| 1 | click "button" | 1-indv |
| 2 | hydrate | 21indv |

## Variant: an await of the view

```rx
import pure { fetch } from "./prelude"
import { Held } from "./t.rx"
export default component App() {
  <Held>{view (s) { <b>{await fetch(s.k)}</b> }}</Held>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | w |
| 1 | resolve "q" "1" | 1 |

## Accepted variants

```rx
-- accept
import { List, Panel } from "./j.js"
component Q() { <i>q</i> }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <Panel as={Q}><props.children n={n} /></Panel>
}
export default component App() {
  <Panel as={Q}><T>{view (s) { <b>{s.n}</b> }}</T></Panel>
}
```

```rx
-- accept
import { List, Panel } from "./j.js"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <List items={[1]}>{view (x) { <props.children n={x} /> }}</List>
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- accept
import { Many, W } from "./t.rx"
export default component App() {
  source saved := null
  <Many>{view (s) { <b onClick={() => { saved := s.n }}>x</b> }}</Many>
  <Many>{view (s) { <b onClick={() => { saved := s.row }}>x</b> }}</Many>
  <W>{view (s) { <b onClick={() => { saved := s.n }}>x</b> }}</W>
}
```

```rx
-- accept
import client pure { where } from "./cl.js"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {errored fallback(e) { <i>x</i> } { {loading fallback { <i>w</i> } { <props.children n={n} /> }} }}
}
export default component App() {
  <T>{view (s) { <b>{await where()}</b> }}</T>
}
```

## Rejected variants

```rx
-- reject: VIEW_FN_EXPECTED
import { mk } from "./j.js"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
R = mk({ component: T })
export default component App() {
  <R />
}
```

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetch } from "./prelude"
import { List, Panel } from "./j.js"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <List items={[1]}>{view (x) { <props.children n={x} /> }}</List>
}
export default component App() {
  <T>{view (s) { <b>{await fetch("x")}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
import { Panel } from "./j.js"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <Panel as={T} />
}
```

```rx
-- reject: CONTEXT_NOT_FOUND
context c: string
import { Many, W } from "./t.rx"
export default component App() {
  <Many>{view (s) { <b>{use c}</b> }}</Many>
}
```

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetch } from "./prelude"
import { Many, W } from "./t.rx"
export default component App() {
  <Many>{view (s) { <b>{await fetch("x")}</b> }}</Many>
}
```

```rx
-- reject: MUTATION_IN_PLACE
import { Arr } from "./t.rx"
export default component App() {
  <Arr>{view (s) { <b onClick={() => { s.xs.push(1) }}>x</b> }}</Arr>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
import { Many, W } from "./t.rx"
export default component App() {
  <Many><b>x</b></Many>
}
```

```rx
-- reject: REGION_ESCAPE
import { Many, W } from "./t.rx"
export default component App() {
  source saved := null
  <Many>{view (s) { <b onClick={() => { saved := s.go }}>x</b> }}</Many>
}
```

```rx
-- reject: CONTENT_MODEL
import { Para } from "./t.rx"
export default component App() {
  <Para>{view (s) { <div>x</div> }}</Para>
}
```

```rx
-- reject: CLIENT_QUESTION_UNHELD
import client pure { where } from "./cl.js"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {errored fallback(e) { <i>x</i> } { <props.children n={await where()} /> }}
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: CLIENT_QUESTION_UNHELD
import client pure { where } from "./cl.js"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {errored fallback(e) { <i>x</i> } { <props.children n={n} /> }}
}
export default component App() {
  <T>{view (s) { <b>{await where()}</b> }}</T>
}
```

```rx
-- reject: RESULT_AS_VALUE
import { useQ } from "./j.js"
component T(props: { children: (s: { q: any }) => View }) {
  q = useQ()
  <props.children q={q} />
}
export default component App() {
  <T>{view (s) { <b>{s.q.data}</b> }}</T>
}
```
