# `provide c = use c`

<!-- check branch=CYCLE upstream=failed says-branch="read it above (`above = use c`) and provide in a block below" -->
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

**Fix in this branch.** A context whose failures are being read adds nothing to itself, and what comes back to itself in one region is `CYCLE` (C-1). RG-7b makes `use` the nearest provision *above*, but a `use` in the region that provides reads that provision, in every runner (`provide c = "x"; o = use c` is `x`): so `provide c = use c` is computed from itself. bd09eb3f, for an hour, accepted it, and it froze:

| `provide c = use c` | mount | after what is above changes |
| --- | --- | --- |
| interpreter | `#error` | throws: the stack |
| oracle and compiled | what is above | does not end |

**What is refused.** Only what overflowed: provisions of one region, each using the next where it stands (under `latest` and `peek`, in one branch, in a closure that a call is given or is), with no name between. A default of itself too.

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

<!-- check branch=CYCLE upstream=failed -->
```rx
context c: string = "out"
component P(props: { children: View }) {
  <b>{if true { provide c = (use c) + "!"
    {props.children} }}</b>
}
component Leaf() { <i>{use c}</i> }
export default component App() { <P><Leaf /></P> }
```

**What is not.** Two regions, and a closure that runs later. They overflowed too, and are right in every runner:

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

<!-- frames branch=pass upstream=fail -->
```rx
context c: { n: number, twice: () => number } = { n: 1, twice: () => 2 }
component P(props: { n: number, children: View }) {
  provide c = { n: props.n, twice: () => (use c).n * 2 }
  <b>{props.children}</b>
}
component Leaf() { <i>{(use c).twice()}</i> }
export default component App() {
  source k := 2
  <P n={k}><Leaf /></P>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `4` |
| 1 | handler `k := 3` | `6` |

**Test.** S-context-4.

## Accepted on upstream, and wrong when it runs

Not refused here, for they are accepted there: the same through a name, whose value is another computation; the same for a context that is exported or writes rows, and for one read only by a handler or an effect.

| `o = use c; provide c = o` | mount | after what is above changes |
| --- | --- | --- |
| interpreter | `#error` | throws: the stack |
| oracle | what is above | what is above |
| compiled | what is above | does not end |

With nothing above and no default, the checkers find the provision itself and accept; compiled, it throws *no provision for c*.

<!-- frames branch=pass upstream=pass -->
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

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `out!` |

<!-- frames branch=fail upstream=fail runner=ref -->
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

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `out!` |

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

**Why not here.** Reading every `use` of a region above it changes programs on which all runners agree, and refusing these refuses what upstream accepts. Which is upstream's to say.

**Instead.** Read above, provide in a block below. Right in every runner, and live:

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
