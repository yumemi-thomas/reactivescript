# `source x := await …` is checked and not compiled

<!-- check branch=ok upstream=ok -->
```rx
import pure { load } from "./data.js"
export default component App() {
  source x := await load(1) -> 0
  {errored fallback(e) { <i>e</i> } { <p>{x}</p> }}
}
```

<!-- app branch=ok upstream=ok says-branch="is not lowered yet" says-upstream="`await` outside an equation's result position is not lowered yet" -->
```rx
import pure { load } from "./data.js"
export default component App() {
  source x := await load(1) -> 0
  {errored fallback(e) { <i>e</i> } { <p>{x}</p> }}
}
```

`source x = await load(1) -> 0` (a question) is compiled.

**On upstream (e650b85; bbe2a18 run by hand, the same).** Both checkers accept; the compiler stops, with no line.

**Spec.** 06 ST-5a: `source x = e` "may `await`". Nothing says what a plain source's first value is while it waits, nor whether it is asked again.

**Not fixed.** Two answers stand: refuse it (a plain source has no question, and `=` says the one that has), or wait for it once. The first is the smaller.
