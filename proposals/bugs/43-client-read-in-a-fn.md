# A question: a `fn` that calls `client` JavaScript

<!-- check branch=CLIENT_NOT_AWAITED upstream=CLIENT_NOT_AWAITED -->
```rx
import client pure { read } from "./data.js"
fn size() => read()
export default component App() {
  <button onClick={() => { let x = size() }}>a</button>
}
```

Awaited in the fn, the row goes up, and the caller answers for its failure:

<!-- check branch=UNHANDLED_FAILURE upstream=UNHANDLED_FAILURE -->
```rx
import client pure { read } from "./data.js"
fn size() {
  x = await read() -> 0
  x
}
export default component App() {
  s = size()
  <p>{s}</p>
}
```

**Spec.** 12 SF-5c: `client` is "inferred upward through `.rx` functions and components that call them … and checked at each call". SF-5b: in reactive scope it "may only be awaited". A fn's body is reactive (R-io-2), so SF-5b refuses the first: the checkers follow it. SF-5c reads as if the fn could be called from a handler. An action can.

**Not changed.** One sentence of SF-5c would settle it. That an awaited `client` read fails with `Error` is R-f-8's default for every import with no `rejects`, and is the same with `import pure`: by design.
