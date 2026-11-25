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

**Not fixed.** RG-4c calls a function prop *ordinary*, 07 §6 says *`props.children` is a `View`, shown by reading it*, and neither says whether children may be the function; the runners do not agree. The decision is upstream's: run it, or refuse both forms.
