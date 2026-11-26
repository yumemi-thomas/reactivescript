# `source x := await …` is checked and not compiled

<!-- check branch=AWAIT_IN_EXPRESSION upstream=ok -->
```rx
import pure { load } from "./data.js"
export default component App() {
  source x := await load(1) -> 0
  {errored fallback(e) { <i>e</i> } { <p>{x}</p> }}
}
```

<!-- app branch=failed upstream=ok says-branch="write `source x = …`" says-upstream="`await` outside an equation's result position is not lowered yet" -->
```rx
import pure { load } from "./data.js"
export default component App() {
  source x := await load(1) -> 0
  {errored fallback(e) { <i>e</i> } { <p>{x}</p> }}
}
```

`source x = await load(1) -> 0` (a question) is compiled.

**On upstream (e650b85; bbe2a18 run by hand, the same).** Both checkers accept; the compiler stops, with no line.

**Spec.** 06 ST-5a: `source x = e` "may `await`". Nothing said what a plain source's first value is while it waits, nor whether it is asked again.

**Fixed (2026-11-26, the smaller of the two answers).** A plain source's seed is a snapshot taken once (E-4), with no
question to wait on: an `await` in it is `AWAIT_IN_EXPRESSION` [ST-5a], whose message says to write `source x = …`.
ST-5a says so. Test: S-check-5.
