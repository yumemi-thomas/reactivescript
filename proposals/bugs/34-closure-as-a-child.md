# A closure as a `.rx` component's children

<!-- check branch=ok upstream=ok -->
```rx
component Toggle(props: { children: (state: { pressed: boolean }) => string }) {
  source lit := false
  <button onClick={() => { lit := !lit }}>{props.children({ pressed: lit })}</button>
}
export default component App() {
  <Toggle>{s => s.pressed ? "y" : "n"}</Toggle>
}
```

Accepted, types too. The interpreter and the oracle throw (*call of non-function*): children are a view there. Compiled, it runs. Written `<Toggle children={s => …} />` it throws in every runner: an application with nothing between its tags has `children: []` after its attributes. Under another name (`render={s => …}`) it is right everywhere.

**Fix in this branch.** The interpreter and the oracle call it, where `props.children(…)` is called and the children are one closure, given on or not (`<T>{props.children}</T>`): what compiled code does and TypeScript types. Nothing that ran changes: the call threw.

Where the closure reads a context, the difference of [33](33-use-in-children.md) shows in it too, a throw before: with `<T>{n => (use c) + n}</T>`, and `T` provides `c`, the interpreter gives `T`'s (`in1`) and the others the caller's (`out1`).

<!-- frames branch=pass upstream=fail runner=ref -->
```rx
component Toggle(props: { children: (state: { pressed: boolean }) => string }) {
  source lit := false
  <button onClick={() => { lit := !lit }}>{props.children({ pressed: lit })}</button>
}
export default component App() {
  <Toggle>{s => s.pressed ? "y" : "n"}</Toggle>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `n` |
| 1 | handler `lit := true` | `y` |

**Left.** `<Toggle children={s => …} />`. A refusal would be of a prop that is dropped in every runner whatever it is; whether children may be an attribute is upstream's to say. Children that are called and shown as well (`{props.children}`) are right in the interpreter alone.

**Test.** S-view-2.
