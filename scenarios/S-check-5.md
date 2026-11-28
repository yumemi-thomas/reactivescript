# S-check-5 — five small defects: an await in a seed, an arrow after `??`, a quoted key in a row, a generic context, a message

Rules exercised: ST-5a, RG-7a, E-9, MO-9b.

Each was accepted and wrong, or said the wrong thing (the roadmap's X3, X4, X5, X9, X10; 2026-11-26).

- `source x := await …` was checked and never compiled (bugs/42). A seed is a snapshot taken once (E-4), with no
  question to wait on: `AWAIT_IN_EXPRESSION`, whose message says to write `source x = await …` (ST-5a).
- `p.h ?? ((e: any) => 0)`: the reference emitter wrote the arrow as a bare operand, which JavaScript does not parse;
  the crate compiled it. Both write it in parentheses.
- A key of a props type that is no identifier (`"tc-button"`) was printed bare in the module's signature row, which a
  name holding `:` or a space would break. It is printed quoted and read back so (MO-9b); the interpreter checks the
  program against the printed `.d.rx` as against the module's body (MO-9).
- `context sel: <T>(p: { item: T }) => View` parsed and was silently a context of a plain value, no context that holds
  a view: a context has no type parameter, `GENERIC_CONTEXT` (RG-7a).
- `INSTANTIATION_NOT_BOUND` said "declares state" of a fn whose body declares only an equation (bugs/22): it names what
  the body declares (`declares a source, \`k\``), the `ref` parameter, or the context it reads. (A fn whose body declares
  only equations is lifted since, E-9b: S-locals-1.)

## Modules

```rx
-- module: ./b.rx
type Attrs = { "tc-button": string; n: number; "a:b"?: string }
export component B(props: Attrs) { <b>{props.n}{props["tc-button"]}{props["a:b"] ?? "-"}</b> }
```

```rx
-- module: ./api.d.rx
export pure fn load(n: number): Promise<number>
```

## Program

```rx
import { B } from "./b.rx"
component P(p: { h?: (e: any) => number }) { g = p.h ?? ((e: any) => 0)
  <i>{g(1)}</i> }
export default component App() {
  source on := false
  <B n={1} tc-button="x" />
  {if on { <P h={(e: any) => 5} /> } else { <P /> }}
  <button onClick={() => { on := true }}>go</button>
}
```

## Frames

| instant | action | frame |
| ------- | ------ | ----- |
| 0 | mount | `1x-0go` |
| 1 | handler `on := true` | `1x-5go` |

## Accepted variants

The question form waits.

```rx
-- accept
import pure { load } from "./api"
export default component App() {
  source x = await load(1) -> 0
  {errored fallback(e) { <i>e</i> } { <p>{x}</p> }}
}
```

## Rejected variants

```rx
-- reject: AWAIT_IN_EXPRESSION
import pure { load } from "./api"
export default component App() {
  source x := await load(1) -> 0
  {errored fallback(e) { <i>e</i> } { <p>{x}</p> }}
}
```

```rx
-- reject: AWAIT_IN_EXPRESSION
import pure { load } from "./api"
export default component App() {
  source x := { n: 1 + (await load(1) -> 0) }
  <p>{x.n}</p>
}
```

```rx
-- reject: GENERIC_CONTEXT
context sel: <T>(p: { item: T }) => View
export default component App() { <p>x</p> }
```

```rx
-- reject: GENERIC_CONTEXT
type Pick = <T>(x: T) => T
context sel: (Pick) = (x) => x
export default component App() { <p>x</p> }
```

```rx
-- reject: INSTANTIATION_NOT_BOUND
fn area(w: number, h: number): number { source k := 2
  w * h * k }
export default component App() { source a := 1
  <p>{area(a, 2)}</p> }
```
