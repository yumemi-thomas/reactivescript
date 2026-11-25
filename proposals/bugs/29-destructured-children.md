# Destructured children are made at once, above what the component provides

<!-- frames branch=pass upstream=fail -->
```rx
context c: string = "none"
component Seen() {
  <b>{use c}</b>
}
component Named(props: { children?: View }) {
  { children } = props
  provide c = "given"
  <i>{children}</i>
}
export default component App() {
  <Named><Seen /></Named>
}
```

| instant | action | frame |
| --- | --- | --- |
| 0 | mount | `given` |

With no `{children}` in the view, the child is made all the same, and its effects run.

**On upstream (e650b85).** `none`. The interpreter is right, and both checkers credit the provision (with no default, the program is accepted and throws).

**Spec.** RG-4b: `{ x } = props` is a projection, as `props.x`. RG-4c: the child decides where its children are placed.

**Cause.** Every equation is a memo, and a memo is computed where it is declared. So is the oracle's.

**Fix in this branch.** An equation that is a projection of the props and holds a view is no computation: it is read where it is written. `children`, by a pattern, a rest, an alias (`kids = props.children`), a default (read once), an arm (`a ? children : b`), and what is provided of them; and a prop whose type is written `View` (in the props' type, or in a `type` or `interface` of the module). In both emitters and the oracle. The errors and the waiting of a child are its place's too.

**Not changed.** A prop that holds a view under another type (`any`, a type of another module) is an equation, as before. A view handed on (`<Other header={children} />`) sees what the component it is handed to provides when compiled, and not in the interpreter: as `props.children` handed on does, in both trees.

**Test.** S-context-3.
