# S-module-18 — components a JS library renders under a root of its own: no word, and what they bring with them

Rules: MO-11s, MO-8r, DV-24, RG-7b, R-f-5.

## Modules

```rx
-- module: ./toast.d.rx
// a toast library: it mounts the toasts it is given with a render() of its own, into a node at the end of <body>
// its row says nothing of where it renders them: the cautious placement, a root of their own (MO-11s)
export pure fn createToaster(options: { template: Component }): any instantiates
// the library's own context: a provider component and a hook
export context toastTheme
export component ToastTheme(props: { children?: View }) provides(toastTheme)
export pure fn useToastTheme(): string uses(toastTheme)
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
// renders(…) is no word in any form (MO-8r)
export pure fn bad(options: { template: Component }): any renders(owner)
```

`renders` (MO-11l, withdrawn 2026-11-23) checked the components a fn is
given as applied where its result is bound. A library that mounts them itself, with a `render()` (or
`createRoot`) of its own (a toaster, a modal manager, a widget host), gives
them a root of their own: no owner above them is the app's, so no
`provide`, `errored` or `loading` above the binding reaches them (Solid's
`useContext` walks owners, and there are none). That needs no word: a fn
that says nothing of where it renders what it is given is read exactly so
(MO-11s), the components checked as applied under a fresh root, as a
program's view is. What they need, they bring. (`renders(root)` said the
same thing in a word, and `renders(root, ctx)` that the library carries a
context of its own into that root; neither was written by any declaration
but this scenario's, and a component that needs the library's context
under the library's root renders its provider itself, as `BrandedToast`
does below.)

## Program

```rx
import { createToaster, ToastTheme } from "./toast.js"
import { accent, Plain, SelfContained } from "./toasts.rx"
import { Branded } from "./branded.rx"

component BrandedToast(props: { text: string }) {
  <ToastTheme><Branded text={props.text} /></ToastTheme>
}
component Toasts() {
  toaster = createToaster({ template: Plain })
  boxed = createToaster({ template: SelfContained })
  branded = createToaster({ template: BrandedToast })
  <button onClick={() => { toaster.show("saved") }}>save</button>
}
export default component App() {
  provide accent = "hot"
  <ToastTheme><Toasts /></ToastTheme>
}
```

Accepted: `Plain` needs nothing, `SelfContained` provides and catches what
its own children need, and `BrandedToast` renders the library's provider
around `Branded` itself, inside the toaster's root.

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

`renders(…)` is no word of a declaration in any form (MO-8r): `renders(root)`
is refused by name, the row without it saying the same, and so is any
other argument, with what is written instead.

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

Nothing is carried into the library's root: the `ToastTheme` above the
binding does not reach `Branded`.
