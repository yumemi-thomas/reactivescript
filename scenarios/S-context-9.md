# S-context-9 — a provision given from what is above it

Rules: RG-7b, C-1.

A block's provision is the block's, wherever it is written in it: `use c` beside `provide c` reads that provision. What
is above it is read in the provision itself — a `use c` written in what `provide c` is given is what is above that
provision, in a closure too. So a provider that merges with the one above is one line, and a provision that comes back
to itself through a name or through a second context of the block is a cycle (it froze, or showed one thing when it
was made and another after an update: the third independent review, 2026-11-26).

The program: a theme whose providers each give what they were given, and the rest from above.

## Program

```rx
context theme: { fg: string; bg: string } = { fg: "f", bg: "b" }
component Th(p: { fg?: string; bg?: string; children?: View }) {
  provide theme = { fg: p.fg ?? (use theme).fg, bg: p.bg ?? (use theme).bg }
  <div>{p.children}</div> }
component R() { t = use theme
  <i>{t.fg}{t.bg}</i> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Th fg={n}><Th bg={n + "2"}><R /></Th><R /></Th> }
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tAA2Ab` |  |
| 1 | handler `n := "B"` | `tBB2Bb` |  |

## Variant: a level counted from the one above

```rx
context level: number = 1
component Section(p: { children?: View }) { provide level = (use level) + 1
  <section>{p.children}</section> }
component H(p: { children?: View }) { l = use level
  <b>{l}:{p.children}</b> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Section><H>a{n}</H><Section><H>b</H></Section></Section> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `t2:aA3:b` |  |
| 1 | handler `n := "B"` | `t2:aB3:b` |  |

## Variant: beside its provision a use reads it, written before it or after

```rx
context c: string = "-"
component Q(p: { k: string; children?: View }) { x = use c
  provide c = p.k
  <b>{x}/{use c}/{p.children}</b> }
export default component App() { source n := "A"
  provide c = n
  <button onClick={() => { n := "B" }}>t</button><Q k={"q" + n}>{use c}</Q> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tqA/qA/qA` |  |
| 1 | handler `n := "B"` | `tqB/qB/qB` |  |

## Variant: two contexts of one block, one given from the other

```rx
context c: string = "-"
context d: string = "="
component Q(p: { children?: View }) { provide c = (use d) + "1"
  provide d = (use d) + "2"
  <b>{p.children}</b> }
export default component App() { source n := "A"
  provide c = n
  provide d = n + "d"
  <button onClick={() => { n := "B" }}>t</button><Q>{use c}/{use d}</Q> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tAd21/Ad2` |  |
| 1 | handler `n := "B"` | `tBd21/Bd2` |  |

## Variant: a closure written in the provision calls the one above

```rx
context log: (s: string) => string = (s: string) => s
component Tag(p: { t: string; children?: View }) { provide log = (s: string) => (use log)(p.t + s)
  <b>{p.children}</b> }
component L() { <i>{(use log)("x")}</i> }
export default component App() { source n := "A"
  <button onClick={() => { n := "B" }}>t</button><Tag t={n}><Tag t="2"><L /></Tag></Tag> }
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `tA2x` |  |
| 1 | handler `n := "B"` | `tB2x` |  |

## Rejected variants

Through a name: `up` beside the provision is that provision.

```rx
-- reject: CYCLE
context theme: { fg: string; bg: string } = { fg: "f", bg: "b" }
component Th(p: { fg?: string; children?: View }) { up = use theme
  provide theme = { fg: p.fg ?? up.fg, bg: up.bg }
  <div>{p.children}</div> }
export default component App() { <Th fg="a"><i>{(use theme).fg}</i></Th> }
```

```rx
-- reject: CYCLE
context c: string = "-"
component Q(p: { children?: View }) { x = use c
  y = x + "!"
  provide c = y
  <b>{p.children}</b> }
export default component App() { <Q>{use c}</Q> }
```

What is above must be there: a context with no default, and nothing provided above the provider.

```rx
-- reject: CONTEXT_NOT_FOUND
context c: string
component Q(p: { children?: View }) { provide c = (use c) + "!"
  <b>{p.children}</b> }
export default component App() { <Q>{use c}</Q> }
```

A default given from itself: it is computed where the context is declared, where nothing provides it.

```rx
-- reject: CYCLE
context c: string = (use c) + "!"
export default component App() { <i>{use c}</i> }
```

Two contexts of one block, each given from the other:

```rx
-- reject: CYCLE
context c: string = "-"
context d: string = "="
component Q(p: { children?: View }) { provide c = (use d) + "1"
  provide d = (use c) + "2"
  <b>{p.children}</b> }
export default component App() { <Q>{use c}{use d}</Q> }
```
