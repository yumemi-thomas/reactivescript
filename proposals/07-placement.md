# 07 — Where a library renders a component it is given

Depends on [01](01-component-rows.md) and [02](02-context-rows.md). Three decisions: the cautious reading; `nests`;
`renders(H)`.

## Problem

A router renders a page under its layout. A toaster renders a toast under its list, after a click. `.rx` cannot give a
component to JavaScript at all.

<!-- check branch=ok upstream=COMPONENT_AS_VALUE+UNKNOWN_COMPONENT -->
```rx
import { createRouter } from "./router.js"
import { loadPerson } from "./people.js"
component Layout(props) {
  <main>{errored fallback(e) { <p>failed</p> } { loading fallback { <p>loading</p> } { <div>{props.children}</div> } }}</main>
}
component Person() { p = await loadPerson("a")
  <h1>{p}</h1> }
Router = createRouter({ routes: [{ path: "/", component: Layout, children: [{ path: "/a", component: Person }] }] })
export default component App() { <Router /> }
-- file: ./router.d.rx
export type Route = { path: string; component: Component; children?: Route[] }
export pure fn createRouter(config: { routes: Route[] }): Component nests(children in component)
-- file: ./people.d.rx
export pure fn loadPerson(id: string): Promise<string>
```

## Proposal

**A factory.** A fn whose declared result is `Component` is instantiated once, and its name is applied in a view. The
components in its arguments are checked inside the made component, where that is applied.

**The cautious reading.** A component given to any other fn is checked as applied under a root of its own, at the call:
no `errored`, `loading` or `provide` above it. It is the right reading of a library that mounts what it is given, and less
than any owner gives.

**`nests(children in component)`** on a factory: a record's `component` renders the entries under its `children` among its
own children. So a layout's regions and provisions reach its pages. A layout that renders no children is refused:

<!-- check branch=NESTED_NOT_RENDERED upstream=COMPONENT_AS_VALUE+UNKNOWN_COMPONENT -->
```rx
import { createRouter } from "./router.js"
component Layout() { <main>hi</main> }
component Person() { <h1>p</h1> }
Router = createRouter({ routes: [{ path: "/", component: Layout, children: [{ path: "/a", component: Person }] }] })
export default component App() { <Router /> }
-- file: ./router.d.rx
export type Route = { path: string; component: Component; children?: Route[] }
export pure fn createRouter(config: { routes: Route[] }): Component nests(children in component)
```

**`renders(H)`** after a fn's signature names a component of the same file. What the fn is given is rendered later, beneath
an application of H. It is checked there, at every place the program applies H, in whichever module.

<!-- check branch=ok upstream=PARSE -->
```rx
import { Toaster, toast } from "./kit.js"
context theme: string
component Saved() { t = use theme
  <p>{t}</p> }
export default component App() {
  provide theme = "dark"
  <Toaster />
  <button onClick={() => { toast(Saved) }}>save</button>
}
-- file: ./kit.d.rx
export component Toaster(props: {})
export fn toast(message: Component): number renders(Toaster)
```

Without the word, the cautious reading refuses it:

<!-- check branch=CONTEXT_NOT_FOUND upstream=PARSE -->
```rx
import { Toaster, toast } from "./kit.js"
context theme: string
component Saved() { t = use theme
  <p>{t}</p> }
export default component App() {
  provide theme = "dark"
  <Toaster />
  <button onClick={() => { toast(Saved) }}>save</button>
}
-- file: ./kit.d.rx
export component Toaster(props: {})
export fn toast(message: Component): number
```

## Evidence

`node proposals/words.mjs`:

| word | rows | programs | correct programs refused without it | mistakes no longer caught |
| --- | --- | --- | --- | --- |
| `nests` | 7 | 7 | 7 | 40 |
| `renders(H)` | 5 | 4 | 4 | 7 |

- `nests`: `@solidjs/router`'s factory in one program. The other six rows are host declarations ([12](12-file-routers.md)),
  which use the word for a router that finds its own files.
- `renders(H)`: Kobalte's toaster, solid-sonner, TanStack Router's code routes; and one module of the app's own over
  TanStack Table.
- No code proves either word. A draft asks (7 and 8 questions over 193 modules).

## Cost

- `nests`: 131 lines in the crate, 33 in `ref/src` (c4a5a6f). Factories are in 01's count.
- `renders(H)`: 748 and 213 (d0c28e5). It is judged over the program from signatures: a module's signature carries its
  calls (`export renders …`) and its places (`hosts(…)`). It is the dearest word in this set.
- The signature format grows by two rows.

## What it does not do

- A library that calls a component with no owner at all (`toast.custom` of solid-sonner) is not covered: no row describes
  it.
- Siblings under `renders(H)` are side by side: a layout's regions are not credited to another page.
- No value is followed to H.

## Alternatives tried and rejected

- *`renders` alone* (rendered at once, beneath the call), *`renders(root, …)`, `renders(later)`* with a prop that
  *`renders T`, `nests(component under parent)`, `outlet`.* All built. Withdrawn by the bar (README): one library wrote
  each, TanStack Router's route values mostly. Following a component through values was the source of most holes found in
  review.
- *Trust the program.* Then a page's failure with no region is found when it happens.

## Compatibility

`COMPONENT_AS_VALUE` is no longer reported for a component in the arguments of a declared fn. It is checked instead.

## Open questions

- Is the cautious reading alone enough for a first step? With it, and no word, 10 of the benchmark's programs are refused.
- Is `renders(H)` worth its cost for toasts? The other way is a message in a source, and a list in markup.

## Prototype

MO-11f, g, i, r, s, u. S-module-6, 9, 10, 16, 18, 22, 23, 27. a54830a, c4a5a6f, d0c28e5.
