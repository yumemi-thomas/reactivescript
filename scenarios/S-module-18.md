# S-module-18 — components a JS library renders under a root of its own: `renders(root)`, and what it carries there

Rules: MO-11n, MO-11l, DV-24, RG-7b, R-f-5.

## Modules

```rx
-- module: ./toast.d.rx
// a toast library: it mounts the toasts it is given with a render() of its own, into a node at the end of <body>
export pure fn createToaster(options: { template: Component }): any renders(root)
// one that carries its own context into that root: it reads `toastTheme` where it is called and provides it there
export context toastTheme
export component ToastTheme(props: { children?: View }) provides(toastTheme)
export pure fn useToastTheme(): string uses(toastTheme)
export pure fn createThemedToaster(options: { template: Component }): any renders(root, toastTheme)
```

```rx
-- module: ./branded.rx
import { useToastTheme } from "./toast.js"
export component Branded(props: { text: string }) {
  theme = useToastTheme()
  <p class={theme}>{props.text}</p>
}
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
view is. What they need, they bring, or the library carries: `renders(root,
toastTheme)` says it reads `toastTheme` where it is called (so it must be
provided above the binding, as a hook's `uses`, MO-12b) and provides it
inside its root. Only JS contexts its own declaration file declares can be
carried: the library cannot know the program's.

## Program

```rx
import { createToaster, createThemedToaster, ToastTheme } from "./toast.js"
import { accent, Plain, SelfContained } from "./toasts.rx"
import { Branded } from "./branded.rx"

component Toasts() {
  toaster = createToaster({ template: Plain })
  boxed = createToaster({ template: SelfContained })
  branded = createThemedToaster({ template: Branded })
  <button onClick={() => { toaster.show("saved") }}>save</button>
}
export default component App() {
  provide accent = "hot"
  <ToastTheme><Toasts /></ToastTheme>
}
```

Accepted: `Plain` needs nothing, `SelfContained` provides and catches what
its own children need, and `Branded`'s `toastTheme` is carried into the
themed toaster's root from the `ToastTheme` above the binding.

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

```rx
-- reject: CONTEXT_NOT_FOUND
import { createThemedToaster } from "./toast.js"
import { Branded } from "./branded.rx"
export default component App() {
  branded = createThemedToaster({ template: Branded })
  <p>app</p>
}
```

What the library carries, it reads where it is called: with no
`ToastTheme` above the binding there is nothing to carry.

```rx
-- reject: CONTEXT_NOT_FOUND
import { createToaster, ToastTheme } from "./toast.js"
import { Branded } from "./branded.rx"
component Toasts() {
  toaster = createToaster({ template: Branded })
  <p>app</p>
}
export default component App() {
  <ToastTheme><Toasts /></ToastTheme>
}
```

A plain `renders(root)` carries nothing: the `ToastTheme` above the
binding does not reach `Branded`.
