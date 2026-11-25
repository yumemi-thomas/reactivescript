# 24 — A question: where does a `use` in children read?

`<Toggle>{(use toggle).pressed ? "on" : "off"}</Toggle>` is accepted, and compiled it reads at the caller: [bug 33](bugs/33-use-in-children.md). A fix was tried and is held back, because the text says two things.

- **RG-4c**: *`children` is a view value evaluated in the* caller's *region: its readers are the caller's, its lifetime is the caller's, and the child only decides where it is placed.*
- **RG-7b**: a provision is for *every region* instantiated beneath *it — the instantiation chain (the tree of views), not the lexical one. `use name` reads the nearest provision above.*
- **08**, of the checker: *children passed to a component are owned where it reads them, so they see its provisions.*

By RG-4c a `use` written in children is one of the caller's readers. By 08 it sees what the component provides, and both checkers accept a program on that ground: the one below is `CONTEXT_NOT_FOUND` if P provides nothing.

<!-- check branch=ok upstream=ok -->
```rx
context c: string
component P(props: { children?: View }) {
  provide c = "in"
  <div>{props.children}</div>
}
export default component App() { <P>{use c}</P> }
```

## What was tried

A `use` in children's own place bound to the owner that reads them, in the crate, `ref/`'s emitter and the oracle (a local branch, a05f579a, not published; its interpreter is unchanged). Bug 33's program is right there, in the browser and served. It is held back for what follows; each line was run on upstream, here and on that branch.

**A context that forwards children.** Nothing is wrong with this program today, and no text says which it is:

<!-- frames branch=pass upstream=pass -->
```rx
context c: string = "out"
context child: View
component Q() {
  provide c = "q"
  <i>{use child}</i>
}
component P(props: { children?: View }) {
  provide child = props.children
  <Q />
}
export default component App() { <P>{use c}</P> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `out` |

`out` on every runner today, the server and hydration included. With the fix, `q` compiled, in the oracle and served; `out` in the interpreter. *Placed* by Q, but *read* by the provision in P.

**A read that nothing owns, or that is taken once.** P provides `c = "in"`, the caller has `out`, the children are `{use c}`:

| read in P | interpreter | compiled today, browser | compiled with the fix |
| --- | --- | --- | --- |
| `effect () { log(props.children) }`, beside the children shown | shows `in`, logs nothing | shows `out`, logs `out` | shows `in`, logs `out` |
| `action go() { log(props.children) }`, beside the children shown | shows `in`, logs nothing | shows `out`, logs `out` | shows `in`, logs `out` |
| a handler, `seen := peek(props.children)`, clicked before hydration | not run | `out` | `out` |
| an action, `seen := props.children` | `out` | `out` | `out` |
| `source x := peek(props.children)`, shown | `out` | `out` | `in` |

**An await.** It is hoisted to where the children are written, so a question asked by a context asks what the caller has: [bug 36](bugs/36-await-by-a-childs-context.md). The fix left those children at the caller as a whole; this branch does not compile them. So `<P>{use c}{false ? await fetch(use c) : "!"}</P>` shows `in!` in the interpreter, and `out!` on upstream and with the fix.

## The question

Which sentence holds? If RG-4c's, then 08 and both checkers credit a provision that is not read. If 08's, then RG-4c needs *a `use` in it reads where it is placed*, and *placed* needs an answer for a forwarded view, for a read nothing owns, for `peek`, and for a question.

## Why it is asked here

A view function, `<Toggle>{view (state) { … }}</Toggle>`, is accepted where Toggle is JavaScript (MO-11k) and is `VIEW_FN_MISPLACED` where it is `.rx`. It is proposed, applied and not called, in [25](25-views.md). A child component that reads a context gives a component's state to its children today.

<!-- frames branch=pass upstream=pass -->
```rx
context toggle: { pressed: boolean }
component Toggle(props: { children: View }) {
  source lit := false
  provide toggle = { pressed: lit }
  <button onClick={() => { lit := !lit }}>{props.children}</button>
}
component Label(props: { mark: string }) { <b>{(use toggle).pressed ? "On" : "Off"}{props.mark}</b> }
export default component App() {
  source mark := "!"
  <Toggle><Label mark={mark} /></Toggle>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `Off!` |
| 1 | handler `lit := true` | `On!` |

**Open: typed lists.** A library that owns the loop gives its row by a context, and a context has one type. Over `any`, a misspelt field is accepted; a generic context or a view function would be needed, and neither was built.

<!-- types branch=ok upstream=ok -->
```rx
context row: any
component List(props: { each: any[]; children: View }) {
  <ul>{for x in props.each { provide row = x
    <li>{props.children}</li> }}</ul>
}
component Name() { <b>{(use row).nmae}</b> }
export default component App() {
  <List each={[{ name: "a" }]}><Name /></List>
}
```

Related: [34](bugs/34-closure-as-a-child.md) (a closure as children), [35](bugs/35-children-in-a-record.md) (children in a record).
