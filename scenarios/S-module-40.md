# S-module-40 — a host declaration: an `.rx` component between a layout and the host's outlet

Rules: MO-14f, MO-14, MO-11i, R-f-5, RG-7b, SV-7d.

## Modules

```rx
-- module: ./router.d.rx
export context router
export pure fn useParams(): { id: string } instantiates uses(router)
export component AppRouter(props: {}) provides(router)
export component Outlet(props: {}) uses(router)
```

```rx
-- module: ./people.d.rx
export error NotFound
export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)
```

```rx
-- module: ./chrome.rx
// the app's page frame, used by every layout: the outlet is written once, here
import { Outlet } from "./router.js"
export component Frame(props: { title: string }) {
  <header>{props.title}</header>
  loading fallback { <p>loading…</p> } { <main><Outlet /></main> }
}
export component Card(props: { children?: View }) {
  <section>{props.children}</section>
}
```

```rx
-- module: ./pages.rx
import { useParams } from "./router.js"
import { fetchPerson, NotFound } from "./people.js"
import { Frame } from "./chrome.rx"
export component Root() {
  <nav><a href="/">Home</a></nav>
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } { <Frame title="Directory" /> }
}
export component Home() {
  <h1>People</h1>
}
export component Person() {
  params = useParams()
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
```

```rx
-- module: ./host.d.rx
import { App } from "./main.rx"
import { Root, Home, Person } from "./pages.rx"
import { AppRouter, Outlet } from "./router.js"
export default component nests(children in component) = {
  component: App,
  children: [{ component: Root, children: [{ component: Home }, { component: Person }] }]
}
```

A layout does not have to write the host's outlet itself. Here every
layout of the app shares one frame, `Frame`, a component of the app's own
in another module, and the router's `<Outlet />` is inside it. The outlet
renders the pages of the nearest route above it, which is the layout that
applied the frame — so the layout's pages are rendered *there*: under what
the frame has around its outlet (`loading`), and under what the layout has
around the frame (`errored`).

Until 2026-11-25 this was `NESTED_NOT_RENDERED` on `Root` ("the frame
takes the outlet as its children"): the rule read an application of the
host's component only in the view of the component the record names. The
checker reads `.rx`, so it follows the application down: a component
whose view applies a component the host renders through — at any depth,
through any number of `.rx` components — is itself one the host renders
through, in the host's view.

## Program

```rx
import { AppRouter } from "./router.js"
component Shell() {
  <div class="shell"><AppRouter /></div>
}
export default component App() {
  <Shell />
}
```

Accepted. The app's own component reaches the router's the same way,
through `Shell`.

## Rejected variants

```rx
-- reject: NESTED_NOT_RENDERED
import { AppRouter } from "./router.js"
component Shell() {
  <div class="shell">no router</div>
}
export default component App() {
  <Shell />
}
```

A component between that applies nothing of the host's renders none of
the records nested in `App`.

```rx
-- reject: NESTED_NOT_RENDERED
import { Card } from "./chrome.rx"
export default component App() {
  <Card />
}
```

Nor does a component that renders *its own* children, given none: `Card`
reads `props.children`, which is what `App` gives it, not what the host
nests in `App`.

```rx
-- reject: CONTEXT_NOT_FOUND
import { AppRouter, useParams } from "./router.js"
component Shell() {
  at = useParams()
  <div class="shell">{at.id}<AppRouter /></div>
}
export default component App() {
  <Shell />
}
```

What is followed is where the records render, and nothing else: `Shell`
is above the router's component, and outside the router.
