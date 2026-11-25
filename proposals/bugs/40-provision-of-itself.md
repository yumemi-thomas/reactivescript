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

**On upstream (e650b85).** Both checkers overflow the stack: the crate's process aborts (a module of a build, the editor), the reference throws. So it is for `(use c) + "!"`, in a branch, at a module's root, and for two contexts given from each other, where `c` is the module's own and writes no rows (RG-7e). A `provide` of an equation that reads it (`o = use c; provide c = o`) is accepted.

**Cause.** What a `use` can fail with is what the context's provisions can; a provision that uses the context asked itself again, without end.

**Fix in this branch.** A context whose failures are being read adds nothing to itself. Its rows were already read so. Every other program is read as before: the set is emptied where a name's failures are worked out, which are kept. **Test.** S-context-4.

## What it reads when it runs

Not fixed, and nothing is refused for it. RG-7b makes `e` the value *beneath* the region, and `use` the nearest provision *above*; but a `use` in the region that provides reads that provision, in every runner (`provide c = "x"; o = use c` is `x`), and 08 counts a region's own provisions among those available in it. So the text does not say what a provision's own value reads. Only what is above makes sense of it, and no runner has quite that:

| | mount | after what is above changes |
| --- | --- | --- |
| interpreter, `provide c = use c` | `#error` (its own) | throws: the stack |
| oracle and compiled, `provide c = use c` | what is above | does not end: its own by then |
| interpreter, `o = use c; provide c = o` | `#error` | throws: the stack |
| oracle, the same | what is above | what is above |
| compiled, the same | what is above | does not end |

The last three rows are as on e650b85, which accepts that program. With nothing above and no default, the checkers find the provision itself and accept; compiled, it throws *no provision for c*.

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

**Why not here.** Reading `use c` above only where it is written in the `provide` would give `provide c = use c` and `o = use c; provide c = o` two meanings, and reading every `use` of a region above it changes programs on which all runners agree. Which is upstream's to say.

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
