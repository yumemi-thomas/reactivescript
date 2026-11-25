# An await in children is asked where they are written

<!-- frames branch=refused upstream=fail says-branch="is not lowered yet" says-upstream="no flight q" -->
```rx
import pure { fetch } from "./prelude"
context c: string
component Show(p: { children: View }) {
  provide c = "q"
  {loading fallback { <i>wait</i> } { {p.children} }}
}
export default component App() {
  {errored fallback(e) { <b>bad</b> } {
    provide c = "outer"
    <Show>{await fetch(use c)}</Show>
  }}
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `wait` |
| 1 | resolve "q" "ok" | `ok` |

The same table, in the reference: its interpreter is right, and its emitter asks `outer`.

<!-- frames branch=pass upstream=pass runner=ref -->
```rx
import pure { fetch } from "./prelude"
context c: string
component Show(p: { children: View }) {
  provide c = "q"
  {loading fallback { <i>wait</i> } { {p.children} }}
}
export default component App() {
  {errored fallback(e) { <b>bad</b> } {
    provide c = "outer"
    <Show>{await fetch(use c)}</Show>
  }}
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `wait` |
| 1 | resolve "q" "ok" | `ok` |

<!-- frames branch=fail upstream=fail runner=ref-compiled -->
```rx
import pure { fetch } from "./prelude"
context c: string
component Show(p: { children: View }) {
  provide c = "q"
  {loading fallback { <i>wait</i> } { {p.children} }}
}
export default component App() {
  {errored fallback(e) { <b>bad</b> } {
    provide c = "outer"
    <Show>{await fetch(use c)}</Show>
  }}
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `wait` |
| 1 | resolve "q" "ok" | `ok` |

**On upstream (e650b85).** Accepted by both checkers. Compiled, and in the oracle, it asks `outer`: an `await` in a view is hoisted to the block it is written in (07 §3), which is above the provision. An `await` that is never reached is enough to see the rest of it, which is [33](33-use-in-children.md):

<!-- frames branch=refused upstream=fail says-branch="is not lowered yet" says-upstream="got 'out!'" -->
```rx
import pure { fetch } from "./prelude"
context c: string = "out"
component P(props: { children?: View }) {
  provide c = "in"
  {errored fallback(e) { <b>bad</b> } { {loading fallback { <i>w</i> } { {props.children} }} }}
}
export default component App() { <P>{use c}{false ? await fetch(use c) : "!"}</P> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `in!` |

**On this branch.** The crate refuses it: *not compiled, `await` outside an equation's result position is not lowered yet*. It refused every `await` in children ([37](37-await-in-children-not-compiled.md)); it compiles them now, but in a module where some application's children read a context: by `use`, or by a name that stands for one (a fn that reads it, what is bound, written or given as a prop from one, what is imported). Names are compared, not scopes, so a correct program of such a module stays refused. The reference's emitter is unchanged.

**What the gate does not see.** A fn that reads a context, given as a prop to a component of another module, which calls it in its children: that module alone does not say what its prop is. It is wrong on this branch with no children as well (the interpreter throws E-9 on it).

**Instead.** The `await` in a block of the children, which has its own place: `{if true { x = await fetch(use c); <b>{x}</b> }}`.

**Test.** `compiler/src/awaits.rs`.
