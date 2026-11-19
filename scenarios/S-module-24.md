# S-module-24 — a UI kit's compound components, its stylesheet, and a polymorphic `as`

Rules: MO-11q, 07 §1a, MO-11c, MO-12.

## Modules

```rx
-- module: ./ui.d.rx
// as a headless UI kit declares it: Dialog.Root provides the dialog's context, its parts read it
export context dialog
export component Dialog.Root(props: { open?: boolean; children?: View }) provides(dialog)
export component Dialog.Trigger(props: { children?: View }) uses(dialog)
export component Dialog.Content(props: { children?: View }) uses(dialog)
export component Button(props: { as?: string | Component; children?: View })
```

A UI kit exports its compound parts on one object (`Dialog.Root`,
`Dialog.Trigger`). `export component Dialog.Root(…)` in a `.d.rx` declares
a member (MO-11q): `import { Dialog } from "./ui.js"` binds each declared
member as a component named as it is written, `<Dialog.Root>`, with its
own rows; `Dialog` itself is a value. Its parts read the dialog's context,
so a part outside `<Dialog.Root>` is refused as any `uses(…)` is (MO-12).

`import "./ui.css"` imports a module for its effect (07 §1a): a
stylesheet, a polyfill. It binds nothing and needs no declaration.

A prop typed `string | Component` takes a component value (MO-11c), as a
polymorphic `as` does.

## Program

```rx
import "./ui.css"
import "@fontsource/inter/index.css"
import { Dialog, Button } from "./ui.js"
component Link() {
  <a href="/help">help</a>
}
export default component App() {
  <Dialog.Root>
    <Dialog.Trigger>open</Dialog.Trigger>
    <Dialog.Content><p>hello</p><Button as={Link}>more</Button></Dialog.Content>
  </Dialog.Root>
  <Button as="a">plain</Button>
}
```

Accepted.

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { Dialog } from "./ui.js"
export default component App() {
  <Dialog.Trigger>open</Dialog.Trigger>
}
```

A part needs its root above it.

```rx
-- reject: UNKNOWN_COMPONENT
import { Dialog } from "./ui.js"
export default component App() {
  <Dialog.Root><Dialog.Footer>x</Dialog.Footer></Dialog.Root>
}
```

Only declared members are components.

```rx
-- reject: PARSE
import "./other.rx"
export default component App() {
  <p>x</p>
}
```

An `.rx` module is imported for what it exports.

```rx
-- types: TS2322
import { Dialog } from "./ui.js"
export default component App() {
  <Dialog.Root open={"yes"}><Dialog.Trigger>open</Dialog.Trigger></Dialog.Root>
}
```

A member's props are typed as its declaration writes them: `open` is a
`boolean`.
