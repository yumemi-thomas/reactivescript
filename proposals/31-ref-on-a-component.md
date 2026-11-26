# 31 — A `ref` given to a component: a handler, and what the component may do with it

`<Part ref={(e) => { el := e }} />` was refused (`REACTIVE_WRITE_IN_OWNED_SCOPE`): since 2026-11-21 a `ref` was a handler on an element only. It is how an app reaches a part's element (22 of the 23 correct programs refused over 65 rewritten packages; Kobalte's `Trigger` and the UI SDK's bridge were kept in JavaScript for it). **Decided: a component written in `.rx` is given `ref` as it is given `on…` — and inside the component such a prop is io, as an action is (SC-4b).**

Why it is sound. Solid calls an element's `ref` through `ref()` → `runRefCallback`: once, in the pass that makes the element, untracked, where a write is allowed as in a render effect's callback and making a primitive throws; it is not called again when the element goes (no `null` call). So a closure that writes is right exactly where it ends at an element's `ref` or an `on…`, or is called from a handler, an action or an apply block. Inside the component the prop can go nowhere else: called in reactive scope it is refused, by name, carried in a record or an array, off a rest or a copy of the props, or given to a method that calls what it is given.

<!-- frames branch=pass upstream=refused -->
```rx
component Field(props: { label: string; ref?: (e: Element) => void }) {
  { label, ...rest } = props
  <label>{label}<input {...rest} /></label>
}
component Row(props: { ref?: (e: Element) => void }) { <i ref={props.ref}>r</i> }
export default component App() {
  source made := 0
  source rows := 1
  <p>{made}</p>
  <Field label="a" ref={(e: Element) => { made := m => m + 1 }} />
  {for i in [1, 2].slice(0, rows) { <Row ref={(e: Element) => { made := m => m + 10 }} /> }}
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `11ar` |
| 1 | handler `rows := 2` | `21arr` |

The same hole was open for `on…` props, on `main` too: the name made the app's closure a handler, and the component could call it while the view computed whenever its type did not answer `void`, or through an array. Every runner throws Solid's `REACTIVE_WRITE_IN_OWNED_SCOPE`; both checkers accepted.

<!-- check branch=REACTIVE_WRITE_IN_OWNED_SCOPE upstream=ok -->
```rx
component Part(p: { onPick: (n: number) => number; label: string }) { <button>{p.label}{p.onPick(2)}</button> }
export default component App() {
  source n := 0
  <Part label="x" onPick={(v: number) => { n := v; return v }} />
  <p>{n}</p>
}
```

<!-- check branch=ACTION_CALLED_IN_OWNED_SCOPE upstream=ok -->
```rx
component Part(p: { onPick: (n: number) => void; label: string }) { g = [p.onPick]
  <button title={str(g[0](2))}>{p.label}</button> }
export default component App() {
  source n := 0
  <Part label="x" onPick={(v: number) => { n := v }} />
  <p>{n}</p>
}
```

The first is refused where it is applied: a prop whose type, as written, answers a value is a function the component calls for what it answers, no handler whatever its name (a component's printed signature says `pure` of it), so its closure is pure. The second, and a prop whose type does not say (`any`), is refused in the component.

A JavaScript component is unchanged: `ref` is a handler there when its declaration says `ref: handler (e: Element) => void` (MO-10g), and with no declaration it is not.

**Evidence.** 456 generated programs (2 props × 38 uses inside the component × 3 types × 2 closures × 3 places, thinned): the two checkers agree on all; the 12 sound uses run the same in the interpreter, the oracle and both emitters; 21 of the 26 unsound uses are refused (the five left are below). S-view-10 in every runner, served and hydrated too. The interpreter and the oracle now call a `ref` (they never did).

**What it does not close** (the same is open for an action carried in a value, on `main`): a handler handed to a closure's parameter and called there (`[props.onPick].map(f => f(1))`, `for f in [props.onPick] { f(1) }`); one given to another component's prop that is no handler and called there in reactive scope; one put in a context typed `any` and called by a reader.

**Two things found on the way.** After a served page is taken over, what one `ref` reads of a source another `ref` wrote in the same pass is the value before it (rendering in the browser, it is the write): a `ref` that counts writes a function of the value (`n := v => v + 1`). And the server shows the frame before the `ref`s, as it does before an effect.
