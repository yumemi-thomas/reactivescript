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

**On this branch.** Refused by both checkers, `AMBIGUOUS_CONTEXT`: no side is chosen. A context used (or written) in a component's children, in no block and no component of theirs, is refused where the component provides that context around every place it shows them in its own view. There the two readings differ (RG-4c: the caller's; RG-7b and 08: where they are shown) and compiled code has the other one than the interpreter. Where the component provides nothing of that name nothing changes; nor where its children are also read by a snapshot, carried by a context, kept in a value, given as a prop, spread or named in an imperative place, or shown in a place outside the provision as well: on those the runners agree, or no summary tells them apart. The printed signature says which, `apart(c)` beside `provides(c)`.

Of 1,116 programs made for it (31 ways to show children, 15 forms of children), the runners differ on 388: 239 are refused, 149 are as they were (a record, a list, a closure, a prop, a snapshot of an applied component). 592 on which they agree are accepted. 129 that show the same frames are refused: in 84 the read is in an attribute or a handler, which a frame does not show, or is not reached in that table; in 23 the children are never shown; in 22 the component provides the very value that is above it. The last is the one way found that a program right in every runner is refused, a wrapper that provides on what it has; binding it above is one line. No program of this tree or upstream's (1,170), no benchmark program and none of the UI SDK rewrite is.

**The price.** 08 and RG-7b accept these programs, the interpreter runs them, and upstream's checkers pass them. Upstream's compiled code is wrong on them or throws, so no one has one that works. If upstream decides for 08 and fixes compiled code, the refusal goes.

**The everyday forms.** `T` is `provide toggle = { on: true }` around `<b>{props.children}</b>`, the default is `{ on: false }`. Run on e650b85 and on this branch, with the same result. The interpreter shows `on` for each (`m` for the sixth):

| between `<T>` and `</T>` | compiled, fresh mount, and the oracle |
| --- | --- |
| `{(use toggle).on ? "on" : "off"}` | `off` |
| `<i>{(use toggle).on ? "on" : "off"}</i>` | `off` |
| `<Label v={(use toggle).on ? "on" : "off"} />` | `off` |
| `{if (use toggle).on { <i>on</i> } else { <i>off</i> }}` | `off` |
| `<section><T>{(use toggle).on ? "on" : "off"}</T></section>` | `off` |
| `{if (use toggle).on { <i>{use size}</i> }}` (`size` is `"m"`) | nothing |
| `{for x in [1] { <i>{(use toggle).on ? "on" : "off"}</i> }}` | `on` |
| `{if true { t = use toggle; <i>{t.on ? "on" : "off"}</i> }}` | `on` |
| `<Reader />`, which reads it | `on` |

Both emitters agree on each, and the server on this branch. On e650b85 the sixth is served as `m`, and its hydration leaves a server node unclaimed.

**Cause.** A block binds its owner once (`const __o = __rt.owner()`), and a `use` in a child's getter names the caller's. The oracle has the same fault. An `if` branch or a row among the children has an owner of its own, and is right.

**A fix was tried.** Where such a read belongs is asked in [24](../24-view-functions.md). A narrower one was tried since and taken back (`proto-children` 2d2b37ff): children read under the owner that reads them, but at the caller for a snapshot or a context's value. What decides is who reads, and the children's getter does not know: a second read in one snapshot was the first one's reader's (S-context-4: `peek([p.children, p.children])`, `outout` in every runner, became `outin` compiled), and each repair moved the edge. A fix has to say at the component's `{props.children}` that it is shown there, and leave every other read.

**Test.** S-context-5 (refused, and what is not); S-context-4 (what a fix must not change).

**Instead.** A child component that reads the context, or the read in a block of the children: `{if true { t = use toggle; <b>{t.pressed ? "on" : "off"}</b> }}`.

**On `proto-children-rule` (2026-11-25): fixed, by the rule.** [26](../26-children-are-shown.md): a component only shows a view it is given, so the read that had to stay the caller's (a snapshot, a context's value, a second read in one computation) is refused, and content is emitted as a block that binds its owner where it is shown. The three programs above are right in the interpreter, the oracle, both emitters, served and hydrated. `AMBIGUOUS_CONTEXT` is gone. What is said above of `proto-children` is as it was there.
