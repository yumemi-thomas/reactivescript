# S-module-18 — components a JS library renders under a root of its own: `renders(root)`

Rules: MO-11n, MO-11l, DV-24, RG-7b, R-f-5.

## Modules

```rx
-- module: ./toast.d.rx
// a toast library: it mounts the toasts it is given with a render() of its own, into a node at the end of <body>
export pure fn createToaster(options: { template: Component }): any renders(root)
```

```rx
-- module: ./toasts.rx
import pure { fetch } from "./prelude"
export context accent: string
export component Plain(props: { text: string }) {
  <p>{props.text}</p>
}
export component Themed(props: { text: string }) {
  <p class={use accent}>{props.text}</p>
}
export component Fetched(props: { text: string }) {
  note = await fetch(props.text)
  <p>{note}</p>
}
export component SelfContained(props: { text: string }) {
  provide accent = "cold"
  errored fallback(e) { <p>failed</p> } {
    loading fallback { <p>…</p> } {
      <Themed text={props.text} /> <Fetched text={props.text} />
    }
  }
}
```

```rx
-- module: ./bad.d.rx
// renders(…) names only root
export pure fn bad(options: { template: Component }): any renders(owner)
```

`renders` (MO-11l) checks the components a fn is given as applied where its
result is bound: right for a table whose cells the app renders in its own
view. A library that mounts them itself, with a `render()` (or
`createRoot`) of its own (a toaster, a modal manager, a widget host), gives
them a root of their own: no owner above them is the app's, so no
`provide`, `errored` or `loading` above the binding reaches them (Solid's
`useContext` walks owners, and there are none). `renders(root)` says so:
the components are checked as applied under a fresh root, as a program's
view is. What they need, they bring.

## Program

```rx
import { createToaster } from "./toast.js"
import { accent, Plain, SelfContained } from "./toasts.rx"

export default component App() {
  provide accent = "hot"
  toaster = createToaster({ template: Plain })
  boxed = createToaster({ template: SelfContained })
  <button onClick={() => { toaster.show("saved") }}>save</button>
}
```

Accepted: `Plain` needs nothing, and `SelfContained` provides and catches
what its own children need.

## Rejected variants

```rx
-- reject: CONTEXT_NOT_FOUND
import { createToaster } from "./toast.js"
import { accent, Themed } from "./toasts.rx"
export default component App() {
  provide accent = "hot"
  toaster = createToaster({ template: Themed })
  <p>app</p>
}
```

The app's `provide accent` is above the binding, not above the toaster's
root: Solid would find no `accent` when the toast renders.

```rx
-- reject: UNHANDLED_FAILURE
import { createToaster } from "./toast.js"
import { Fetched } from "./toasts.rx"
export default component App() {
  errored fallback(e) { <p>failed</p> } {
    loading fallback { <p>…</p> } {
      toaster = createToaster({ template: Fetched })
      <p>app</p>
    }
  }
}
```

The `errored` above the binding does not catch what fails under another
root.

```rx
-- reject: PARSE
import { bad } from "./bad.js"
export default component App() {
  <p>{bad}</p>
}
```

`root` is the only place `renders(…)` names.
