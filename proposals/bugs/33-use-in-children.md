# A context read in a component's children is read at the caller

<!-- frames branch=pass upstream=fail says-upstream="no provision for toggle" -->
```rx
context toggle: { pressed: boolean }
component Toggle(props: { children: View }) {
  source lit := false
  provide toggle = { pressed: lit }
  <button onClick={() => { lit := !lit }}>{props.children}</button>
}
export default component App() {
  source mark := "!"
  <Toggle>{(use toggle).pressed ? "on" : "off"}{mark}</Toggle>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `off!` |
| 1 | handler `lit := true` | `on!` |
| 2 | handler `mark := "?"` | `on?` |

**On upstream (e650b85).** Accepted by both checkers, and right in the interpreter. Compiled, it depends on the target. A fresh mount in a browser throws *no provision for toggle*. The server's output shows `off!`, and its hydration throws. Where the caller has a provision of its own, or the context has a default, the mount reads that one, in silence.

<!-- frames branch=pass upstream=pass runner=ref -->
```rx
context toggle: { pressed: boolean }
component Toggle(props: { children: View }) {
  source lit := false
  provide toggle = { pressed: lit }
  <button onClick={() => { lit := !lit }}>{props.children}</button>
}
export default component App() {
  <Toggle>{(use toggle).pressed ? "on" : "off"}</Toggle>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `off` |
| 1 | handler `lit := true` | `on` |

<!-- frames branch=pass upstream=fail runner=ssr says-upstream="page.evaluate: Error: RG-7b: no provision for toggle" -->
```rx
context toggle: { pressed: boolean }
component Toggle(props: { children: View }) {
  source lit := false
  provide toggle = { pressed: lit }
  <button onClick={() => { lit := !lit }}>{props.children}</button>
}
export default component App() {
  <Toggle>{(use toggle).pressed ? "on" : "off"}</Toggle>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `off` |

**On this branch before the fix.** The same, but for the server, which threw too: what a region provides is no longer seen beside it ([30](30-provision-leaks.md)).

**Cause.** A block binds its owner once (`const __o = __rt.owner()`), and a `use` in a child's getter names the caller's. The oracle has the same fault. An `if` branch or a row among the children has an owner of its own, and is right.

**Fix, on `proto-children`.** Children with a `use` in their own place, and no `await` there, are read under the owner that reads them (`__rt.place`), in both emitters and the oracle. Read by nothing that owns (an effect, a handler, an action), by a snapshot, or as a context's value, they are the caller's, as before. Nothing else of children changes: how many are made, when, how long they live. [24](../24-view-functions.md) has what is not decided.

**Left.** A read nothing owns (24's table); how many are made (RG-4c: compiled, one at each place; the interpreter, one); children with an `await` ([36](36-await-by-a-childs-context.md)); in a record ([35](35-children-in-a-record.md)).

**Test.** S-context-4; `compiler/test/js-host.mjs`.
