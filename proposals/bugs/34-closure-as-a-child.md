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

**Fix, on `proto-children`.** The interpreter and the oracle call it, where `props.children(…)` is called and the children are one closure, given on or not (`<T>{props.children}</T>`): what compiled code does and TypeScript types. Nothing that ran changes: the call threw.

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
