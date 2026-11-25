# `provide c = use c`

<!-- check branch=ok upstream=failed -->
```rx
context c: string = "out"
component P(props: { children: View }) {
  provide c = use c
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

**On upstream (e650b85).** Both checkers overflow the stack: the crate's process aborts (a module of a build, the editor), the reference throws. So it is for `(use c) + "!"`, in a branch, at a module's root, and for two contexts given from each other, where `c` is the module's own, writes no rows (RG-7e) and is read by a view.

**Cause.** What a `use` can fail with is what the context's provisions can; a provision that uses the context asked itself again, without end.

**What it means, decided (2026-11-26, after three answers).** RG-7b makes `use` the nearest provision *above*, and a `use` beside a provision reads that provision, in every runner (`provide c = "x"; o = use c` is `x`): a block's provision is the block's. So the question is what the `use` *in the provision's own expression* reads. This branch first refused it (`CYCLE`: "read it above and provide in a block below"), which left the merging provider, the commonest use of a context given from itself, to a block written for nothing; a prototype then read what is above while the provision was being computed (a switch of the runtime), which an independent review found wrong through a name, with two contexts, in a closure and for a `use` written before the `provide`. The rule now is the text's: **a `use c` written in what `provide c` is given is what is above that provision**, in a closure there too, compiled as a read made before the block provides.

<!-- frames branch=pass upstream=fail -->
```rx
context theme: { fg: string, bg: string } = { fg: "f", bg: "b" }
component Th(props: { fg?: string, children: View }) {
  provide theme = { ...(use theme), fg: props.fg ?? (use theme).fg }
  <b>{props.children}</b>
}
component Leaf() { <i>{(use theme).fg}{(use theme).bg}</i> }
export default component App() {
  source k := "a"
  <Th fg={k}><Th><Leaf /></Th></Th>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `ab` |
| 1 | handler `k := "b"` | `bb` |

**What is refused.** What comes back to itself where it stands: through a name beside the provision, through a second context of the block, a default of itself. The message gives the form above.

<!-- check branch=CYCLE upstream=ok says-branch="what is above it is read in the provision itself" -->
```rx
context c: string = "out"
component P(props: { children: View }) {
  o = use c
  provide c = o + "!"
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

Upstream accepts this one, and it is wrong when it runs there: what is above when it is made, then no end on the first update in compiled code (the interpreter: `#error`, then the stack).

<!-- check branch=CYCLE upstream=failed -->
```rx
context c: string = "out"
context d: string = "d"
component P(props: { children: View }) {
  provide c = use d
  provide d = use c
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

With nothing above and no default, the `use` in the provision has nothing to read (it threw *no provision for c* when it ran):

<!-- check branch=CONTEXT_NOT_FOUND upstream=failed -->
```rx
context c: string
component P(props: { children: View }) {
  provide c = (use c) + "!"
  <b>{props.children}</b>
}
export default component App() { <P>x</P> }
```

**What is not.** In a block, in two regions, in a closure. They overflowed too, and are right in every runner:

<!-- check branch=ok upstream=failed -->
```rx
context c: string = "out"
component P(props: { children: View }) {
  <b>{if true { provide c = (use c) + "!"
    {props.children} }}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

<!-- frames branch=pass upstream=fail -->
```rx
context c: string = "c"
context d: string = "d"
component P(props: { v: string }) {
  provide d = (use c) + props.v
  <b>{if true { provide c = (use d) + "?"
    <Leaf /> }}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() {
  source k := "a"
  <P v={k} />
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `ca?` |
| 1 | handler `k := "b"` | `cb?` |

A closure kept in the provision reads what is above it when it is called (the first rule of this branch read the provision there, `4` and `6` for one provider: the closure is written above the provision, and a decorator, `write: s => (use log).write(tag + s)`, can mean nothing else):

<!-- frames branch=pass upstream=fail -->
```rx
context c: { n: number, twice: () => number } = { n: 1, twice: () => 2 }
component P(props: { n: number, children: View }) {
  provide c = { n: props.n, twice: () => (use c).n * 2 }
  <b>{props.children}</b>
}
component Leaf() { <i>{(use c).n}{(use c).twice()}</i> }
export default component App() {
  source k := 5
  <P n={k}><P n={7}><Leaf /></P></P>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `710` |
| 1 | handler `k := 6` | `712` |

**Test.** S-context-9, S-context-11; `compiler/tests/cli.rs` (each shape that overflowed ends).

## Accepted on upstream, and wrong when it runs

The same for a context that is exported or writes rows, and for one read only by a handler or an effect: accepted there, and no end on the first update.

<!-- check branch=ok upstream=ok -->
```rx
export context c: string = "out"
component P(props: { children: View }) {
  provide c = use c
  <b>{props.children}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

Here it reads what is above, as the first program does.

**The other way to write it.** Read above through a name, provide in a block below. Right in every runner on upstream too, and live:

<!-- frames branch=pass upstream=pass -->
```rx
context c: string = "out"
component P(props: { v?: string, children: View }) {
  o = use c
  <b>{if true { provide c = props.v ?? o
    {props.children} }}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() {
  source k := "a"
  <P v={k}><P><Leaf /></P></P>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `a` |
| 1 | handler `k := "b"` | `b` |

<!-- frames branch=pass upstream=pass -->
```rx
context cfg: { size: string, dark: boolean } = { size: "m", dark: false }
component Dark(props: { children: View }) {
  o = use cfg
  <b>{if true { provide cfg = { ...o, dark: true }
    {props.children} }}</b>
}
component Leaf() { <i>{(use cfg).size}{(use cfg).dark ? "!" : "?"}</i> }
export default component App() {
  source k := "s"
  provide cfg = { size: k, dark: false }
  <Dark><Leaf /></Dark>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `s!` |
| 1 | handler `k := "l"` | `l!` |
