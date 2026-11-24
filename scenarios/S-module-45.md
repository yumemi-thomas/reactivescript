# S-module-45 — a name is its binding's, whatever the language calls by that name

Rules: MO-1d, R-io-4, EF-7, 11 CP-4.

## Modules

```rx
-- module: ./own.rx
export fn sum(a: number, b: number): string => `${a}&${b}`
export fn len(x: string): string => `<${x}>`
```

The language's functions (`len`, `map`, `sum`, `log`, …) are functions, not syntax: a name that something binds is that
binding's. Until 2026-11-24 the compiled module read an import of such a name as the language's function, and dropped the
import. `compiler/test/names.mjs` holds every such name under every kind of binding.

## Program

```rx
import { sum, len as size } from "./own.rx"
import pure { every } from "./api"
import pure { filter as keep, len } from "./prelude"
fn fail(x: number): string => `fine ${x}`
component Row(props: { map: (x: number) => string }) {
  { map } = props
  <i>{map(1)} </i>
}
export default component App() {
  source str := "s"
  source seen := ""
  a = await every("k")
  action log(x: string) { seen := x }
  action onSettled(x: string) { seen := x }
  errored fallback(e) { <p>error</p> } {
    <p onClick={() => { log("mine") }}>{sum(1, 2)} {size("a")} {len("abc")} {len(keep([1, 2, 3], (x) => x > 1))} {fail(0)} {str} {a} {seen} <Row map={(x) => `m${x}`} />{for indexOf in ["o"] { <b>{indexOf}</b> }}</p>
  }
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `` |
| 1 | resolve "every:k" "asked" | `1&2 <a> 3 2 fine 0 s asked m1o` |
| 2 | handler `log("mine")` | `1&2 <a> 3 2 fine 0 s asked mine m1o` |
| 3 | handler `onSettled(str)` | `1&2 <a> 3 2 fine 0 s asked s m1o` |

## Rejected variants

An import without `pure` is io, whatever its name:

```rx
-- reject: IO_IN_REACTIVE
import { fetch } from "./lib.js"
export default component App() {
  <p>{fetch("/x")}</p>
}
```

A word that begins an expression reads as its form wherever it is mentioned (`latest(x)` is `latest x`), so nothing is bound to it:

```rx
-- reject: PARSE
import pure { latest } from "./lib.js"
export default component App() {
  <p>{latest(5)}</p>
}
```

## Accepted variants

```rx
-- accept
import pure { latest as newest, sum } from "./lib.js"
export default component App() {
  <p>{newest(5)} {sum(5)}</p>
}
```
