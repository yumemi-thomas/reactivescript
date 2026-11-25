# S-view-5 — views of other names, and plain content, across modules

Rules: RG-4c, MO-3, MO-9, O-3, SV-7d.

## Modules

```rx
-- module: ./t.rx
export component T(props: { cell?: (s: { v: string }) => View, children?: View | ((s: { on: boolean }) => View) }) {
  source lit := false
  <div>{if props.cell { <props.cell v="v" /> }}<props.children on={lit} /></div>
}
```

```rx
-- module: ./u.rx
export component T(props: { cell: (s: { v: string }) => View, children?: View | ((s: { on: boolean, go: () => void }) => View) }) {
  source lit := false
  <table><tbody><tr><props.cell v="v" /></tr></tbody></table><p><props.children on={lit} go={() => lit} /></p>
}
export component Sp(props: { children: (s: { n: number }) => View }) {
  source st := { n: 1 }
  <props.children {...st} />
}
```

## Program

```rx
import { T } from "./t.rx"
export default component App() {
  source m := "."
  <T>{view (s) { <b>{s.on ? "on" : "off"}{m}</b> }}</T><T>{m}</T><T>{view cell (s) { <i>{s.v}</i> }}c</T>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | off..vc |  |
| 1 | handler `m := "!"` | off!!vc |  |

## Accepted variants

```rx
-- accept
import { T, Sp } from "./u.rx"
export default component App() {
  source saved := null
  <T>{view cell (s) { <td onClick={() => { saved := s.v }}>{s.v}</td> }}x</T><T>{view cell (s) { <td>{s.v}</td> }}{view (s) { <b onClick={() => { saved := s.on }}>1</b> }}</T><Sp>{view (s) { <b onClick={() => { saved := s.n }}>1</b> }}</Sp>
}
```

## Rejected variants

```rx
-- reject: CONTENT_MODEL
import { T, Sp } from "./u.rx"
export default component App() {
  <T>{view cell (s) { <b>{s.v}</b> }}x</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
import { T, Sp } from "./u.rx"
export default component App() {
  <T>x</T>
}
```

```rx
-- reject: CONTENT_MODEL
import { T, Sp } from "./u.rx"
export default component App() {
  <T>{view cell (s) { <td>x</td> }}<div>x</div></T>
}
```

```rx
-- reject: REGION_ESCAPE
import { T, Sp } from "./u.rx"
export default component App() {
  source saved := null
  <T>{view cell (s) { <td>x</td> }}{view (s) { <b onClick={() => { saved := s.go }}>1</b> }}</T>
}
```
