# S-view-3 — a view an `.rx` component shows with what it knows

Rules: RG-4c, RG-4b, RG-7b, R-f-5, O-3, W-1, SV-3, SV-7d.

A component whose `children` are declared a function giving a `View` may show them as `<props.children a={e} … />`: a view
the caller writes as `{view (s) { … }}`, with the caller's names, owned where it is shown, at each place it is shown. `s` is
the view's props (RG-4b): `s.a` is the argument, read where it is read. It is shown, never read: a change of an argument
makes nothing again (`keeps-state`).

## Program

```rx
component T(props: { children: (s: { on: boolean, n: number }) => View }) {
  source lit := false
  source n := 1
  <div><props.children on={lit} n={n} /></div>
}
export default component App() {
  source mark := "!"
  <T>{view (s) { {if s.on { <b>On{mark}</b> } else { <i>Off{mark}{s.n}</i> }} }}</T>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | Off!1 |  |
| 1 | handler `n := 4` | Off!4 |  |
| 2 | handler `lit := true` | On! |  |
| 3 | handler `mark := "?"` | On? |  |

## Variant: action

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { v: string, save: (x: string) => Promise<void> }) => View }) {
  source v := "a"
  action save(x) { guess v := x
 await fetch("s") catch (e) => ""
 v := x }
  <p><props.children v={v} save={save} /></p>
}
export default component App() {
  <T>{view (s) { <button onClick={() => { s.save("b") }}>{s.v}</button> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a |  |
| 1 | handler `save("b")` | b |  |
| 2 | resolve "s" "1" | b |  |

## Variant: arg-eq-pending

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { x: string }) => View }) {
  source q := "a"
  x = await fetch(q)
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children x={x} /> }} }}
}
export default component App() {
  <T>{view (s) { <b>{s.x}{pending? s.x ? "…" : ""}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "a" "1" | 1 |  |
| 2 | handler `q := "b"` | 1… |  |
| 3 | resolve "b" "2" | 2 |  |

## Variant: arg-own-errored

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { x: string }) => View }) {
  x = await fetch("a")
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children x={x} /> }} }}
}
export default component App() {
  <T>{view (s) { <u>k</u>{errored fallback(e) { <i>mine</i> } { <b>{s.x}</b> }} }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | reject "a" "no" | kmine |  |

## Variant: arg-own-loading

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { x: string }) => View }) {
  x = await fetch("a")
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children x={x} /> }} }}
}
export default component App() {
  <T>{view (s) { <u>k</u>{loading fallback { <i>mine</i> } { <b>{s.x}</b> }} }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | kmine |  |
| 1 | resolve "a" "1" | k1 |  |

## Variant: await-above

```rx
import pure { fetch } from "./prelude"
component T(props: { children: () => View }) { <p><props.children /></p> }
export default component App() {
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <T>{view () { <b>{await fetch("q")}</b> }}</T> }} }}
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "q" "1" | 1 |  |

## Variant: await-arg

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { x: string }) => View }) {
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children x={await fetch("q")} /> }} }}
}
export default component App() {
  <T>{view (s) { <b>{s.x}!</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "q" "1" | 1! |  |

## Variant: await-fails

```rx
import pure { fetch } from "./prelude"
component T(props: { children: () => View }) {
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children /> }} }}
}
export default component App() {
  <T>{view () { <b>{await fetch("q")}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | reject "q" "no" | bad |  |

## Variant: await-hole

```rx
import pure { fetch } from "./prelude"
context c: string
component T(props: { children: () => View }) {
  provide c = "q"
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children /> }} }}
}
export default component App() {
  <T>{view () { <b>{await fetch(use c)}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "q" "1" | 1 |  |

## Variant: await-in

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { q: string }) => View }) {
  source q := "a"
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children q={q} /> }} }}
}
export default component App() {
  <T>{view (s) { x = await fetch(s.q)
 <b>{x}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "a" "1" | 1 |  |
| 2 | handler `q := "b"` | 1 |  |
| 3 | resolve "b" "2" | 2 |  |

## Variant: ctx-above

```rx
context c: string
component T(props: { children: () => View }) {
  <p><props.children /></p>
}
export default component App() {
  provide c = "app"
  <T>{view () { <b>{use c}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | app |  |

## Variant: ctx-below

```rx
context c: string = "out"
component T(props: { children: () => View }) {
  provide c = "in"
  <p><props.children /></p>
}
export default component App() {
  <T>{view () { <b>{use c}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | in |  |

## Variant: ctx-forward

```rx
context c: string = "out"
component I(props: { children: (s: { x: number }) => View }) { provide c = "inner"
 <p><props.children x={1} /></p> }
component O(props: { children: (s: { x: number, y: number }) => View }) { provide c = "outer"
 <I>{view (s) { <props.children x={s.x + 1} y={5} /> }}</I> }
export default component App() {
  <O>{view (s) { <b>{use c}{s.x}{s.y}</b> }}</O>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | inner25 |  |

## Variant: ctx-nested

```rx
context c: string
component T(props: { v: string, children: (s: { v: string }) => View }) {
  provide c = props.v
  <div><props.children v={props.v} /></div>
}
export default component App() {
  <T v="1">{view (o) { <i>{use c}</i><T v="2">{view (n) { <b>{use c}{o.v}{n.v}</b> }}</T> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1212 |  |

## Variant: ctx-nodefault

```rx
context c: string
component T(props: { children: () => View }) {
  source v := "a"
  provide c = v
  <p><props.children /></p>
}
export default component App() {
  <T>{view () { x = use c
 <b>{x}{use c}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | aa |  |
| 1 | handler `v := "b"` | bb |  |

## Variant: ctx-provided-in-view

```rx
context c: string = "out"
component R() { <u>{use c}</u> }
component T(props: { children: () => View }) { <p><props.children /><R /></p> }
export default component App() {
  <T>{view () { provide c = "v"
 <R /> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | vout |  |

## Variant: deferred

```rx
component T(props: { children: (s: { n: number }) => View }) {
  source n := 0
  <p><props.children n={n} /></p>
}
export default component App() {
  <T>{view (s) { deferred d = s.n
 <b>{s.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 0 |  |
| 1 | handler `n := 1` | 1 |  |

## Variant: destruct-rest

```rx
component T(props: { children: (s: { n: number, t: string }) => View }) {
  source hn := 1
  <props.children n={hn} t="x" />
}
export default component App() {
  <T>{view (s) { { n, ...rest } = s
  <b>{n}</b><i {...rest}>{rest.t}</i> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1x |  |
| 1 | handler `hn := 2` | 2x |  |

## Variant: destruct

```rx
component T(props: { children: (s: { n: number, t: string }) => View }) {
  source hn := 1
  <props.children n={hn} t="x" />
}
export default component App() {
  <T>{view (s) { { n, t = "d" } = s
  <b>{n}{t}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1x |  |
| 1 | handler `hn := 2` | 2x |  |

## Variant: draft

```rx
component T(props: { children: (s: { d: { n: number } }) => View }) {
  source k := 1
  x = draft(pre x -> { n: 0 }) { d.n := k }
  <props.children d={x} />
}
export default component App() {
  <T>{view (s) { <b>{s.d.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1 |  |
| 1 | handler `k := 4` | 4 |  |

## Variant: dupkeys

```rx
component L(props: { rows: string[], children: (p: { r: string }) => View }) { <ul>{for r in props.rows { <props.children r={r} /> }}</ul> }
export default component App() {
  source xs := ["a", "a", "b"]
  <L rows={xs}>{view (p) { <li>{p.r}</li> }}</L>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | aab |  |
| 1 | handler `xs := ["b", "a"]` | ba |  |

## Variant: empty-view

```rx
component T(props: { children: () => View }) { <p>x<props.children />y</p> }
export default component App() {
  source on := false
  <T>{view () { {if on { <b>b</b> }} }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | xy |  |
| 1 | handler `on := true` | xby |  |

## Variant: eq-eff

```rx
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { d = s.n * 2
  was = pre d ?? 0
  effect (s.n) { log($0) }
  <b>{d}/{was}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 2/0 | log(1) |
| 1 | handler `n := 3` | 6/2 | log(3) |

## Variant: errored-inside

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {errored fallback(e) { <i>bad</i> } { <p><props.children n={n} /></p> }}
}
error Bad(k) => `b${k}`
export default component App() {
  <T>{view (s) { <b>{s.n > 1 ? throw Bad(s.n) : s.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1 |  |
| 1 | handler `n := 2` | bad |  |

## Variant: flush

```rx
component T(props: { children: (s: { n: number }) => View }) {
  source n := 0
  <p><props.children n={n} /></p>
}
export default component App() {
  <T>{view (s) { effect (s.n) { onFlush(() => { log("f") }) }
 <b>{s.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 0 | log(f) |
| 1 | handler `n := 1` | 1 | log(f) |

## Variant: fragments

```rx
component T(props: { children: (s: { n: number }) => View }) { <><props.children n={1} /></> }
export default component App() {
  <T>{view (s) { <>a<b>{s.n}</b></> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a1 |  |

## Variant: given-spread

```rx
component T(props: { a: string, children: (s: { n: string }) => View }) { <p><props.children n={props.a} /></p> }
export default component App() {
  r = { a: "z" }
  <T {...r}>{view (s) { <b>{s.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | z |  |

## Variant: guess

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { v: string }) => View }) {
  source v := "a"
  action go() { guess v := "b"
 await fetch("save") catch (e) => ""
 v := "c" }
  <p><props.children v={v} /></p>
}
export default component App() {
  <T>{view (s) { <b>{s.v}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a |  |
| 1 | handler `go()` | b |  |
| 2 | resolve "save" "1" | c |  |

## Variant: if-cond

```rx
component T(props: { children: (s: { n: number }) => View }) {
  source on := true
  source n := 0
  {if on { <props.children n={n} /> }}
}
export default component App() {
  <T>{view (s) { source own := 0
  effect () { log("made")
 return () => { log("gone") } }
 <b>{s.n}{own}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 00 | log(made) |
| 1 | handler `own := 5` | 05 |  |
| 2 | handler `on := false` |  | log(gone) |
| 3 | handler `on := true` | 00 | log(made) |

## Variant: inner-comp

```rx
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <p><props.children n={n} /></p>
}
export default component App() {
  component In(p: { x: number }) { <u>{p.x}</u> }
  <T>{view (s) { <In x={s.n} /> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1 |  |
| 1 | handler `n := 2` | 2 |  |

## Variant: inst-fn

```rx
fn useN(ref n: number) { source own := 0
 d = n + own
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source hn := 1
  <p><props.children n={hn} /></p>
}
export default component App() {
  <T>{view (s) { x = useN(s.n)
 <b>{x}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1 |  |
| 1 | handler `hn := 4` | 4 |  |
| 2 | handler `own := 2` | 6 |  |

## Variant: keeps-state

```rx
component T(props: { children: (s: { n: number }) => View }) {
  source n := 0
  <p><props.children n={n} /></p>
}
export default component App() {
  <T>{view (s) { source own := 0
  effect () { log("made")
 return () => { log("gone") } }
 <b>{s.n}{own}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 00 | log(made) |
| 1 | handler `own := 5` | 05 |  |
| 2 | handler `n := 1` | 15 |  |
| 3 | handler `n := 2` | 25 |  |

## Variant: kids-in-view

```rx
component Box(props: { children?: View }) { <div>{props.children}</div> }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <Box><props.children n={n} /></Box>
}
export default component App() {
  <T>{view (s) { <Box>{s.n}<Box>{s.n}</Box></Box> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 11 |  |
| 1 | handler `n := 2` | 22 |  |

## Variant: kids-twice

```rx
component Box(props: { children?: View }) { <div>{props.children}</div> }
component T(props: { children: (s: { n: number }) => View, extra?: View }) {
  source n := 1
  <Box><props.children n={n} /></Box>{props.extra}
}
export default component App() {
  <T extra="e">{view (s) { <b>{s.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1e |  |

## Variant: latest-s

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { x: string }) => View }) {
  source q := "a"
  x = await fetch(q)
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children x={x} /> }} }}
}
export default component App() {
  <T>{view (s) { <b>{latest s.x}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "a" "1" | 1 |  |

## Variant: loading-around

```rx
component T(props: { children: (s: { n: number }) => View }) { <p><props.children n={1} /></p> }
import pure { fetch } from "./prelude"
export default component App() {
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <T>{view (s) { <b>{s.n}{await fetch("q")}</b> }}</T> }} }}
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "q" "1" | 11 |  |

## Variant: loading-on

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { q: string }) => View }) {
  source q := "a"
  {errored fallback(e) { <i>bad</i> } { {loading on(q) fallback { <i>w</i> } { <props.children q={q} /> }} }}
}
export default component App() {
  <T>{view (s) { <b>{await fetch(s.q)}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "a" "1" | 1 |  |
| 2 | handler `q := "b"` | w |  |
| 3 | resolve "b" "2" | 2 |  |

## Variant: never

```rx
component T(props: { children: (s: { k: string }) => View }) {
  source on := false
  <p>{if on { <props.children k="a" /> } else { <i>n</i> }}</p>
}
export default component App() {
  <T>{view (s) { effect () { log("x") }
 <b>{s.k}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | n |  |

## Variant: noparam

```rx
component T(props: { children: () => View }) {
  source on := false
  {if on { <props.children /> }}
}
export default component App() {
  <T>{view () { effect () { log("i")
 return () => { log("o") } }
 <b>x</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount |  |  |
| 1 | handler `on := true` | x | log(i) |
| 2 | handler `on := false` |  | log(o) |
| 3 | handler `on := true` | x | log(i) |

## Variant: optional

```rx
component T(props: { children?: (s: { n: number }) => View }) {
  source n := 1
  <p>{if props.children { <props.children n={n} /> } else { <i>d{n}</i> }}</p>
}
export default component App() {
  <T /><T>{view (s) { <b>v{s.n}</b> }}</T><T></T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | d1v1d1 |  |

## Variant: pass-s

```rx
component R(props: { n: number }) { <u>{props.n}</u> }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <R n={s.n} /><R {...s} /> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 11 |  |
| 1 | handler `n := 2` | 22 |  |

## Variant: peek-s

```rx
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { source first := peek s.n
 <b>{first}{s.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 11 |  |
| 1 | handler `n := 2` | 12 |  |

## Variant: portal

```rx
context c: string = "o"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  provide c = "i"
  <p>x{portal { <props.children n={n} /> }}</p>
}
export default component App() {
  <T>{view (s) { <b>{s.n}{use c}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | x » 1i |  |
| 1 | handler `n := 2` | x » 2i |  |

## Variant: recursive

```rx
type N = { v: string, kids: N[] }
component Tree(props: { n: N, children: (s: { v: string }) => View }) {
  <div><props.children v={props.n.v} />{for k in props.n.kids { <Tree n={k}>{view (s) { <props.children v={s.v} /> }}</Tree> }}</div>
}
export default component App() {
  source t := { v: "a", kids: [{ v: "b", kids: [{ v: "c", kids: [] }] }, { v: "d", kids: [] }] }
  source m := "."
  <div><Tree n={t}>{view (s) { <b>{s.v}{m}</b> }}</Tree></div>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a.b.c.d. |  |
| 1 | handler `m := "-"` | a-b-c-d- |  |
| 2 | handler `t.kids[1].v := "z"` | a-b-c-z- |  |

## Variant: rest

```rx
component T(props: { title: string, kind: string, children: (s: { n: string }) => View }) {
  { kind, children: none, ...rest } = props
  <p {...rest}><props.children n={kind} />{rest.title}</p>
}
export default component App() {
  source t := "t"
  <T title={t} kind="k">{view (s) { <b>{s.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | kt |  |
| 1 | handler `t := "u"` | ku |  |

## Variant: row-ctx

```rx
context c: string
component L(props: { children: (s: { r: string }) => View }) { {for r in ["a", "b"] { provide c = r
 <props.children r={r} /> }} }
export default component App() {
  <L>{view (s) { <b>{s.r}{use c}</b> }}</L>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | aabb |  |

## Variant: settled

```rx
component T(props: { children: (s: { n: number }) => View }) {
  source n := 0
  <p><props.children n={n} /></p>
}
export default component App() {
  <T>{view (s) { effect (s.n) { onSettled(() => { log(s.n) }) }
 <b>{s.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 0 | log(0) |

## Variant: shadow

```rx
component T(props: { children: (props: { n: number }) => View }) { <p><props.children n={3} /></p> }
export default component App() {
  <T>{view (props) { <b>{props.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 3 |  |

## Variant: shadow2

```rx
component T(props: { children: (s: { n: number }) => View }) { <p><props.children n={3} /></p> }
component U(props: { k: string }) {
  <T>{view (props) { <b>{props.n}</b> }}</T>{props.k}
}
export default component App() {
  <U k="k" />
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 3k |  |

## Variant: spread-s

```rx
component T(props: { children: (s: { a: { title: string } }) => View }) {
  source n := "a"
  <props.children a={{ title: n }} />
}
export default component App() {
  <T>{view (s) { <b {...s.a}>{s.a.title}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | a |  |
| 1 | handler `n := "b"` | b |  |

## Variant: ssr-ids

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { n: number }) => View }) { <section><props.children n={1} /><props.children n={2} /></section> }
export default component App() {
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <T>{view (s) { x = await fetch(`k${s.n}`)
 <b>{x}</b> }}</T> }} }}
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "k1" "1" | w |  |
| 2 | resolve "k2" "2" | 12 |  |

## Variant: store

```rx
component T(props: { children: (s: { d: { a: number, b: { c: number } } }) => View }) {
  source d := { a: 1, b: { c: 2 } }
  <props.children d={d} />
}
export default component App() {
  <T>{view (s) { <b>{s.d.a}{s.d.b.c}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 12 |  |
| 1 | handler `d.b.c := 5` | 15 |  |
| 2 | handler `d := { a: 9, b: { c: 8 } }` | 98 |  |

## Variant: stream

```rx
import pure { fetch } from "./prelude"
component T(props: { children: (s: { x: string }) => View }) {
  x = await* fetch("a")
  {errored fallback(e) { <i>bad</i> } { {loading fallback { <i>w</i> } { <props.children x={x} /> }} }}
}
export default component App() {
  <T>{view (s) { <b>{s.x}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | w |  |
| 1 | resolve "a" "1" | 1 |  |
| 2 | resolve "a" "2" | 2 |  |

## Variant: style

```rx
component T(props: { children: () => View }) {
  <p class="k"><props.children /></p>
  <style>.k { color: red }</style>
}
export default component App() {
  <T>{view () { <b class="m">x</b> }}</T>
  <style>.m { color: blue }</style>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | x |  |

## Variant: table

```rx
component L(props: { rows: string[], children: (p: { r: string }) => View }) { <table><tbody>{for r in props.rows { <tr><props.children r={r} /></tr> }}</tbody></table> }
export default component App() {
  <L rows={["a", "b"]}>{view (p) { <td>{p.r}</td> }}</L>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | ab |  |

## Variant: text-view

```rx
component T(props: { children: (s: { n: string }) => View }) { <p><props.children n="q" /></p> }
export default component App() {
  <T>{view (s) { {s.n} }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | q |  |

## Variant: twice

```rx
component T(props: { children: (s: { k: string }) => View }) {
  <p><props.children k="a" /><props.children k="b" /></p>
}
export default component App() {
  <T>{view (s) { source c := peek s.k
  <b>{c}{s.k}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | aabb |  |

## Variant: type-alias

```rx
type P = { children: (s: { n: number }) => View }
component T(props: P) { <props.children n={1} /> }
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | 1 |  |

## Accepted variants

```rx
-- accept
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source saved := null
  <T>{view (s) { <b onClick={() => { saved := { n: s.n } }}>x</b> }}</T>
}
```

```rx
-- accept
component T(props: { id: string, children: (s: { id: string }) => View }) { <props.children id={props.id} /> }
component O(props: { children: (s: { id: string }) => View }) { <T id="a">{view (s) { <props.children id={s.id} /> }}</T> }
export default component App() {
  source saved := ""
  <O>{view (s) { <b onClick={() => { saved := s.id }}>x</b> }}</O>
}
```

```rx
-- accept
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
export default component App() {
  <T>{view (s) { source mine := null
 <b onClick={() => { mine := s.go }}>{str(mine)}</b> }}</T>
}
```

```rx
-- accept
component L(props: { rows: any[], children: (s: { row: any }) => View }) { {for r in props.rows { <props.children row={r} /> }} }
export default component App() {
  source picked := null
  source xs := [{ id: 1 }]
  <L rows={xs}>{view (s) { <b onClick={() => { picked := s.row }}>x</b> }}</L>
}
```

```rx
-- accept
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
export default component App() {
  source saved := 0
  <T>{view (s) { <b onClick={() => { saved := s.n }}>x</b> }}</T>
}
```

```rx
-- accept
component T(props: { id: string, children: (s: { id: string }) => View }) { <props.children id={props.id} /> }
export default component App() {
  source saved := ""
  <T id="a">{view (s) { <b onClick={() => { saved := s.id }}>x</b> }}</T>
}
```

```rx
-- accept
component T(props: { children?: (s: { n: number }) => View }) {
  source n := 1
  {if props.children { {for x in [1] { {loading fallback { <i>w</i> } { <props.children n={n} /> }} }} }}
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- accept
component T(props: { children: (s: { n: number }) => string }) {
  source n := 1
  <b>{str(props.children({ n: 1 }))}</b>
}
export default component App() {
  <T>{s => str(s.n)}</T>
}
```

```rx
-- accept
component T(props: { title: string, children: () => View }) { { children: none, ...rest } = props
 <p {...rest}><props.children /></p> }
export default component App() {
  <T title="x">{view () { <b>x</b> }}</T>
}
```

## Rejected variants

A component that shows a view names it nowhere else; it is given one view and nothing else; what the view reads is
checked where it is shown.

```rx
-- reject: VIEW_FN_MISPLACED
component T(props: { children?: (s: { n: number }) => View }) {
  source n := 1
  {if props.children { <i>x</i> }}<props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: DUPLICATE_DECLARATION
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { source s := 1
 <b>{s}</b> }}</T>
}
```

```rx
-- reject: REGION_ESCAPE
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
export default component App() {
  source saved := null
  <T>{view (s) { <b onClick={() => { saved := { f: () => s.n } }}>x</b> }}</T>
}
```

```rx
-- reject: REGION_ESCAPE
source saved := null
component K(props: { f: () => void }) { <b onClick={() => { saved := { f: props.f } }}>x</b> }
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
export default component App() {
  <T>{view (s) { <K f={s.go} /> }}</T>
}
```

```rx
-- reject: REGION_ESCAPE
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
export default component App() {
  source saved := []
  <T>{view (s) { effect (s.go) { saved := v => [...v, s.go] }
 <b>x</b> }}</T>
}
```

```rx
-- reject: REGION_ESCAPE
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
export default component App() {
  source saved := null
  <T>{view (s) { f = s.go
 <b onClick={() => { saved := f }}>x</b> }}</T>
}
```

```rx
-- reject: REGION_ESCAPE
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
component O(props: { children: (s: { go: () => void }) => View }) { <T>{view (s) { <props.children go={s.go} /> }}</T> }
export default component App() {
  source saved := null
  <O>{view (s) { <b onClick={() => { saved := s.go }}>x</b> }}</O>
}
```

```rx
-- reject: REGION_ESCAPE
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
export default component App() {
  source saved := null
  <T>{view (s) { <b onClick={() => { let f = s.go
 saved := f }}>x</b> }}</T>
}
```

```rx
-- reject: REGION_ESCAPE
source saved := null
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
export default component App() {
  <T>{view (s) { <b onClick={() => { saved := { f: s.go } }}>x</b> }}</T>
}
```

```rx
-- reject: REGION_ESCAPE
component T(props: { go: () => void, children: (s: { go: () => void }) => View }) { <props.children go={props.go} /> }
export default component App() {
  source saved := null
  {for x in [1] { source q := x
 <T go={() => q}>{view (s) { <b onClick={() => { saved := s.go }}>x</b> }}</T> }}
}
```

```rx
-- reject: REGION_ESCAPE
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
export default component App() {
  source saved := null
  <T>{view (s) { <b onClick={() => { saved := s }}>x</b> }}</T>
}
```

```rx
-- reject: REGION_ESCAPE
component T(props: { label?: string, go?: () => void, children: (s: { n: number, go: () => void }) => View }) {
  source n := 1
  action bump() { n := 2 }
  <props.children n={n} go={() => n} />
}
export default component App() {
  source saved := null
  <T>{view (s) { <b onClick={() => { saved := s.go }}>x</b> }}</T>
}
```

```rx
-- reject: CONTENT_MODEL
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <a href="#"><props.children n={n} /></a>
}
export default component App() {
  <T>{view (s) { <a href="#">x</a> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T children={1}>{view (s) { <b>1</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children?: (s: { n: number }) => View }) {
  source n := 1
  {if props.children { <props.children n={n} /> }}
}
export default component App() {
  <T children={1} />
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {str(props.children({ n: 1 }))}
}
export default component App() {
  <T>{view (s) { <b>1</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source n := 1
  <T>{s => s.n}</T>
}
```

```rx
-- reject: CONTEXT_NOT_FOUND
context c: string
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />{if true { provide c = "x"
 <props.children n={n} /> }}
}
export default component App() {
  <T>{view (s) { <b>{use c}</b> }}</T>
}
```

```rx
-- reject: CONTEXT_NOT_FOUND
context c: string
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{use c}</b> }}</T>
}
```

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetch } from "./prelude"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={await fetch("x")} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetch } from "./prelude"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  x = await fetch("x")
  <props.children n={x} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetch } from "./prelude"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />{errored fallback(e) { <i>x</i> } { <props.children n={n} /> }}
}
export default component App() {
  <T>{view (s) { <b>{await fetch("x")}</b> }}</T>
}
```

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetch } from "./prelude"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{await fetch("x")}</b> }}</T>
}
```

```rx
-- reject: CONTEXT_NOT_FOUND
context c: string
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
component O(props: { children: (s: { n: number }) => View }) { <T>{view (s) { <props.children n={s.n} /> }}</T> }
export default component App() {
  <O>{view (s) { <b>{use c}</b> }}</O>
}
```

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetch } from "./prelude"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
component O(props: { children: (s: { n: number }) => View }) { <T>{view (s) { <props.children n={s.n} /> }}</T> }
export default component App() {
  <O>{view (s) { <b>{await fetch("x")}</b> }}</O>
}
```

```rx
-- reject: CONTENT_MODEL
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <p><props.children n={n} /></p>
}
component O(props: { children: (s: { n: number }) => View }) { <T>{view (s) { <props.children n={s.n} /> }}</T> }
export default component App() {
  <O>{view (s) { <div>x</div> }}</O>
}
```

```rx
-- reject: WRITE_TO_NON_SOURCE
import pure { fetch } from "./prelude"
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { action go() { guess s.n := 2
 await fetch("x") catch (e) => "" }
 <b onClick={() => { go() }}>x</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source n := 1
  <T>{if true { <b>x</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{if true { {view (s) { <b>1</b> }} }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <div>{view (s) { <b>1</b> }}</div>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source n := 1
  <T>{view (s) { <b>1</b> }}x</T>
}
```

```rx
-- reject: MUTATION_IN_PLACE
component T(props: { children: (s: { xs: number[] }) => View }) {
  source n := 1
  source xs := [1]
  <props.children xs={xs} />
}
export default component App() {
  <T>{view (s) { <b onClick={() => { s.xs.push(1) }}>x</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view h (s) { <i>h</i> }}{view (s) { <b>1</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source n := 1
  <T></T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source n := 1
  <T>{view (a, b) { <b>1</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source n := 1
  <T><b>x</b></T>
}
```

```rx
-- reject: CONTENT_MODEL
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <p><props.children n={n} /></p>
}
export default component App() {
  <T>{view (s) { <div>x</div> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source n := 1
  <T>{n}</T>
}
```

```rx
-- reject: MUTATION_IN_PLACE
component T(props: { children: (s: { xs: number[] }) => View }) {
  source n := 1
  source xs := [1]
  <props.children xs={xs} />
}
export default component App() {
  <T>{view (s) { <b onClick={() => { log(s.xs.sort()) }}>x</b> }}</T>
}
```

```rx
-- reject: CONTENT_MODEL
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <div><props.children n={n} /></div>
}
export default component App() {
  <T>{view (s) { <tr><td>x</td></tr> }}</T>
}
```

```rx
-- reject: CONTENT_MODEL
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <table><tbody><tr><props.children n={n} /></tr></tbody></table>
}
export default component App() {
  <T>{view (s) { <b>x</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source n := 1
  <T>x</T>
}
```

```rx
-- reject: UNHANDLED_FAILURE
error Bad(k) => `b`
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n > 1 ? throw Bad(1) : 2}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source n := 1
  <T>{view (s) { <b>1</b> }}{view (s) { <b>2</b> }}</T>
}
```

```rx
-- reject: WRITE_TO_NON_SOURCE
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b onClick={() => { s.n := 2 }}>x</b> }}</T>
}
```

```rx
-- reject: WRITE_TO_NON_SOURCE
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b onClick={() => { s := 2 }}>x</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  action go() { log(props.children) }
  <b onClick={() => { go() }}><props.children n={n} /></b>
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} children={1} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  r = { n: 1 }
  <props.children {...r} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  a = [props.children]
  <b>{len(a)}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <b title={props.children}><props.children n={n} /></b>
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {props.children({ n: 1 })}<props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <b>{str((props.children catch (e) => "x"))}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  f = () => props.children
  <b>{str(f())}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  x = props.children ? 1 : 2
  <b>{x}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n}>hi</props.children>
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
context c: any
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  provide c = props.children
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  { children } = props
  <b>{str(children)}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  { children: B } = props
  <B n={1} /><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  d = draft({ a: 0 }) { d.a := props.children }
  <b>{d.a}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  effect () { log(props.children) }
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <p {...props}><props.children n={n} /></p>
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  f = props.children
  <b>{str(f)}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
fn f(p: any) => p.children
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <b>{str(f(props))}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {for x in [props.children] { <i>x</i> }}<props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <b onClick={() => { log(props.children) }}><props.children n={n} /></b>
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <b>{str(props["children"])}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  source k := "children"
  <b>{str(props[k])}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <b>{str(latest props.children)}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {loading on(props.children) fallback { <i>w</i> } { <props.children n={n} /> }}
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  component N(p: { k: number }) { <props.children n={1} /> }
  <N k={1} /><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {if !props.children { <i>x</i> } else { <props.children n={n} /> }}
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component T(props: { children?: (s: { n: number }) => View }) {
  source n := 1
  {if props.children { <i>x</i> } else { <props.children n={n} /> }}
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component T(props: { children?: (s: { n: number }) => View }) {
  source n := 1
  {if n > 0 { <props.children n={n} /> }}
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component T(props: { children?: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: UNKNOWN_COMPONENT
component T(props: { children: (s: { n: number }) => View, header: (s: { n: number }) => View }) {
  source n := 1
  <props.header n={1} /><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <Inner v={props.children} /><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <Inner v={props} /><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <Inner>{props.children}</Inner><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <Inner {...props} /><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  source f := peek props.children
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {portal to(props.children) { <i>x</i> }}<props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  {props.children}<props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  r = { props }
  <b>{str(r)}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  r = { v: props.children }
  <b>{str(r)}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  x = useX(props.children)
  <b>{str(x)}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  { ...rest } = props
  <p {...rest}><props.children n={n} /></p>
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  effect () { onSettled(() => { log(props.children) }) }
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <b>{`${props.children}`}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: UNKNOWN_COMPONENT
component T(props: { children: (a: number, b: number) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>x</T>
}
```

```rx
-- reject: UNKNOWN_COMPONENT
type B = (s: { n: number }) => View
component T(props: { children: B }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>x</T>
}
```

```rx
-- reject: UNKNOWN_COMPONENT
component T(props: { children: (s: { n: number }) => string }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>x</T>
}
```

```rx
-- reject: UNKNOWN_COMPONENT
component T(props: { children: View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>x</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  action go() { await until(() => props.children) }
  <b onClick={() => { go() }}>x</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_MISPLACED
component Inner(props: { v?: any, children?: View }) { <p>{props.children}</p> }
fn useX(ref f: any) { source q := 1
 d = f
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <b>{str(props)}</b><props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: WRITE_TO_NON_SOURCE
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <b onClick={() => { props.children := 1 }}><props.children n={n} /></b>
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={() => { n := 2 }} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: IO_IN_REACTIVE
component T(props: { children: (s: { onGo: () => void }) => View }) {
  source n := 1
  <props.children onGo={() => { n := 2 }} />
}
export default component App() {
  <T>{view (s) { <b onClick={s.onGo()}>x</b> }}</T>
}
```

```rx
-- reject: COMPONENT_AS_VALUE
component Q() { <i>q</i> }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={Q} />
}
export default component App() {
  <T>{view (s) { <b>{s.n}</b> }}</T>
}
```

```rx
-- reject: VIEW_FN_EXPECTED
export default component App(props: { children: () => View }) { <props.children /> }
```

```rx
-- reject: SNAPSHOT_ARGUMENT
fn useN(n: number) { source o := n
 d = n + o
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { x = useN(s.n)
 <b>{x}</b> }}</T>
}
```

```rx
-- reject: SNAPSHOT_INITIALIZER
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { source q := s.n
 <b>{q}</b> }}</T>
}
```

```rx
-- reject: INSTANTIATION_NOT_BOUND
fn useN(ref n: number) { source o := 0
 d = n + o
 d }
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{useN(s.n)}</b> }}</T>
}
```

```rx
-- reject: SNAPSHOT_KEPT
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{peek s.n}</b> }}</T>
}
```

```rx
-- reject: PRE_OF_NON_REACTIVE
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { x = pre s
 <b>{str(x)}</b> }}</T>
}
```

```rx
-- reject: REACTIVE_WRITE_IN_OWNED_SCOPE
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  source q := 0
  <T>{view (s) { x = [1].map(r => { q := r; r })
 <b>{x}</b> }}</T>
}
```

```rx
-- reject: UNBOUND
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <b>{lit}</b> }}</T>
}
```

```rx
-- reject: UNKNOWN_COMPONENT
component T(props: { children: (s: { n: number }) => View }) {
  source n := 1
  <props.children n={n} />
}
export default component App() {
  <T>{view (s) { <s.children /> }}</T>
}
```
