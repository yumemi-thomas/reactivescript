# A condition on `children` breaks hydration

<!-- frames branch=pass upstream=fail runner=ssr says-upstream="Hydration key miss" -->
```rx
component Card(props: { children?: View }) {
  {if props.children { <div>{props.children}</div> }}
}
export default component App() { <Card><i>x</i></Card> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `x` |

**On upstream (e650b85), and on this branch.** Accepted, and right in the interpreter, the oracle and a fresh mount, in both emitters. Served, it is right; hydrating throws *Hydration key miss*: the condition's element is not among the server's. So it is with a component for the child, with two elements, with `!= undefined`, an `else`, `{has = !!props.children}`, `{props.children ? … : …}`, `&&`, and the `if` inside an element. It is right with a text (`<Card>x</Card>`) or a value (`{"x"}`), with no children, and without the condition.

**Cause.** `props.children` is a getter that makes the view each time it is read (RG-4c). The condition makes one to test it and drops it; the block makes another. On the server both take a hydration key and only the second is sent, so the browser's first, made in the test, looks for a key that is not in the page. Solid's JSX does the same: its `children()` helper is for this.

<!-- frames branch=pass upstream=pass runner=ssr -->
```rx
component Card(props: { children?: View }) {
  {if props.children { <div>{props.children}</div> }}
}
export default component App() { <Card>x</Card> }
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `x` |

**Fixed, by the rule of [26](../26-children-are-shown.md).** A condition on children asks whether there are any, and makes no view: the question is asked of the argument as it was written, and the children are made once, where they are shown. (It read: "not fixed here: reading them once, or testing presence, are both rules for what a read of `children` is, which [24](../24-view-functions.md) asks". 26 is that rule.)

**Instead.** A prop that says so: `<Card filled>`, `{if props.filled { … }}`.
