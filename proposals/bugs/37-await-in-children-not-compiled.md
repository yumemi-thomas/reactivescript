# An await in a component's children was not compiled

A bug of this branch, not of `main`.

<!-- frames branch=pass upstream=pass -->
```rx
import pure { fetch } from "./prelude"
component P(props: { children?: View }) { <div>{props.children}</div> }
export default component App() {
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { <P>{await fetch("q")}</P> }} }}
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `w` |
| 1 | resolve "q" "1" | `1` |

**On this branch before the fix.** Accepted by both checkers, right in the reference's emitter, and the crate said *`await` outside an equation's result position is not lowered yet*. Upstream compiles it.

**Cause.** A hoisted `await` is found again by the address of its expression, and the crate copied a component's children to leave out its render props (MO-11k).

**Fix in this branch.** The children are emitted where they are. In a module whose children read a context they are refused as before: [36](36-await-by-a-childs-context.md).

**Test.** S-view-1.

**On `proto-children-rule` (2026-11-25).** [26](../26-children-are-shown.md): no module is refused any more for what its other children read.
