# S-function-source — a source that holds a function

Rules: W-6, V-1, E-6, C-2, H-2, ST-1, ST-3a, SV-3, TY-2.

A function is a value, so a source may begin as one. (Compiled, it was read
as Solid's derived signal, `createSignal(f)`: the source held what `f`
answers.) A write applies the function it is given, whatever the source
holds (W-6), so another function is written as the answer of one:
`f := () => g`.

## Program

```rx
type Label = (n: number) => string
context label: Label = (n) => `#${n}`
source twice: (n: number) => number := (n) => n * 2
fn held(g: () => string): () => string { source kept := g
  () => kept() }
component Show(props: { f: () => string }) {
  mine = props.f
  source first: () => string := peek props.f
  text = use label
  <i>{props.f()}{mine()}{first()}{text(1)}</i>
}
export default component App() {
  source shown: () => string := () => "a"
  source none: (() => string) | null := null
  source rec := { f: () => "r", n: 1 }
  same = shown
  copy = held(() => "k")
  effect (shown) { log(shown()) }
  provide label = (n) => `${shown()}${n}`
  <p><b>{shown()} {same()} {(pre shown -> shown)()} {copy()} {twice(2)} {none ? none() : "-"} {rec.f()}</b> <Show f={shown} /></p>
}
```

## Frames

| instant | action | frame | effect |
| --- | --- | --- | --- |
| 0 | mount | `a a a k 4 - r aaaa1` | log(a) |
| 1 | handler `shown := was => () => was() + "b"` | `ab ab a k 4 - r ababaab1` | log(ab) |
| 2 | handler `none := () => () => "n"` | `ab ab a k 4 n r ababaab1` |  |
| 3 | handler `twice := () => (n) => n * 20` | `ab ab a k 40 n r ababaab1` |  |
| 4 | handler `rec.f := () => () => "q"` | `ab ab a k 40 n q ababaab1` |  |
| 5 | handler `none := null` | `ab ab a k 40 - q ababaab1` |  |

## Variant: a guess, a hold, and the writes that compose

```rx
export default component App() {
  source f: () => string := () => "p"
  source n := 1
  d = await fetch(str(n))
  action go() {
    guess f := v => () => v() + "g"
    try { await fetch("a") } catch (e) { }
    f := v => () => v() + "w"
  }
  <p>{errored fallback(e) { <i>e</i> } { loading fallback { <i>wait</i> } { <b>{d}{f()}</b> } }}</p>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `wait` |
| 1 | resolve "1" "A" | `Ap` |
| 2 | handler `go()` | `Apg` |
| 3 | resolve "a" 1 | `Apw` |
| 4 | handler `n := 2; f := v => () => v() + "!"` | `Apw` |
| 5 | handler `f := v => () => v() + "?"` | `Apw` |
| 6 | resolve "2" "B" | `Bpw!?` |

## Variant: an updater is given the slot as it stands

A source that began as a record is a store behind its slot (ST-1). Once
`null` or a number was written, that is what an updater is given, and what
it answers is stored, whatever it is. (Compiled, it was given the store's
last record, and an answer that was no record was dropped.)

```rx
export default component App() {
  source r: { n: number } | number | null := { n: 1 }
  action twice() {
    r := null
    r := v => v ? { n: 0 } : { n: 100 }
    r := v => ({ n: len(str(v)) })
  }
  <p>{str(r)}</p>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `{"n":1}` |
| 1 | handler `r := null` | `null` |
| 2 | handler `r := v => v ? v : { n: 9 }` | `{"n":9}` |
| 3 | handler `r := v => null` | `null` |
| 4 | handler `r := v => 7` | `7` |
| 5 | handler `r := v => v + 1` | `8` |
| 6 | handler `twice()` | `{"n":9}` |

## Server frames

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `a a a k 4 - r aaaa1` |

## Rejected variants

A written function is no value: it would be applied, and what it answers
stored.

```rx
-- types: TS2322
export default component App() {
  source f: () => string := () => "a"
  <button onClick={() => { f := () => "b" }}>{f()}</button>
}
```

```rx
-- types: TS2345
component Button(props: { done: () => string }) {
  source f: () => string := () => "a"
  <button onClick={() => { f := props.done }}>{f()}</button>
}
export default component App() { <Button done={() => "b"} /> }
```

```rx
-- accept
component Button(props: { done: () => string }) {
  source f: (() => string) | null := null
  <button onClick={() => { f := () => props.done }} onBlur={() => { f := null }}>{f ? f() : ""}</button>
}
export default component App() { <Button done={() => "b"} /> }
```
