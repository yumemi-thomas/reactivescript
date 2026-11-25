# A context read in a component's children is read at the caller

<!-- frames branch=fail upstream=fail says-branch="no provision for toggle" says-upstream="no provision for toggle" -->
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

<!-- frames branch=fail upstream=fail runner=ssr says-branch="server render threw: RG-7b: no provision for toggle" says-upstream="page.evaluate: Error: RG-7b: no provision for toggle" -->
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

**On this branch.** The same, but for the server, which throws too: what a region provides is no longer seen beside it ([30](30-provision-leaks.md)).

**Cause.** A block binds its owner once (`const __o = __rt.owner()`), and a `use` in a child's getter names the caller's. The oracle has the same fault. An `if` branch or a row among the children has an owner of its own, and is right.

**Not fixed here.** Where such a read belongs is asked in [24](../24-view-functions.md), with the fix that was tried. A narrower one was tried since and taken back (`proto-children` 2d2b37ff): children read under the owner that reads them, but at the caller for a snapshot or a context's value. What decides is who reads, and the children's getter does not know: a second read in one snapshot was the first one's reader's (S-context-4: `peek([p.children, p.children])`, `outout` in every runner, became `outin` compiled), and each repair moved the edge. A fix has to say at the component's `{props.children}` that it is shown there, and leave every other read.

**Test.** S-context-4: the programs a fix must not change.

**Instead.** A child component that reads the context, or the read in a block of the children: `{if true { t = use toggle; <b>{t.pressed ? "on" : "off"}</b> }}`.
