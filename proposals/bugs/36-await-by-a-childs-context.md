# An await in children is asked where they are written

<!-- frames branch=pass upstream=fail says-upstream="no flight q" -->
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

<!-- frames branch=pass upstream=fail runner=ref-compiled -->
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

<!-- frames branch=pass upstream=fail says-upstream="got 'out!'" -->
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

**On this branch.** Both checkers refuse these two: the question is asked by a context the component provides ([33](33-use-in-children.md), `AMBIGUOUS_CONTEXT`). Where they do not, the crate still refuses it: *not compiled, `await` outside an equation's result position is not lowered yet*. It refused every `await` in children ([37](37-await-in-children-not-compiled.md)); it compiles them now, but in a module where some application's children read a context: by `use`, or by a name that stands for one (a fn that reads it, what is bound, written or given as a prop from one, what is imported). Names are compared, not scopes, so a correct program of such a module stays refused. The reference's emitter is unchanged. A narrower gate was tried and taken back (`proto-children` 2d2b37ff): asked of those children alone, it compiled six correct programs more, refused some that this one compiles (a fn with state kept as a value anywhere in the program; S-view-1), and compiled a wrong one that this one refuses (a fn declared in the component, under another name). Where a module's children read a context, [33](33-use-in-children.md) is in its code as well.

**What the gate does not see.** A fn that reads a context, given as a prop to a component of another module, which calls it in its children: that module alone does not say what its prop is. It is wrong on this branch with no children as well (the interpreter throws E-9 on it).

**Instead.** The `await` in a block of the children, which has its own place: `{if true { x = await fetch(use c); <b>{x}</b> }}`.

**Test.** `compiler/src/awaits.rs`.

**On `proto-children-rule` (2026-11-25): fixed, by the rule.** [26](../26-children-are-shown.md): content is a block made where it is shown, so an `await` in it is hoisted into that block and asked there, once for each place. The four programs above are right in every runner. The crate's gate (92 lines of `awaits.rs`) is gone, and its eighteen programs that were not compiled are compiled (`awaits.rs`, tests).
