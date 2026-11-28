# S-module-38 — a host declaration: what the host renders through a component of its own

Rules: MO-14f, MO-14, MO-11i, MO-12c, R-f-5, RG-7b.

## Modules

```rx
-- module: ./router.d.rx
// a router in rows: its context, a hook that reads it, the component that renders the routes (and provides the
// router to them), and the component a layout renders its pages with
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
-- module: ./pages.rx
// a layout written the way the router's own documentation writes one: it renders its pages with <Outlet />, and takes
// no children
import { Outlet, useParams } from "./router.js"
import { fetchPerson } from "./people.js"
export component Root() {
  <nav><a href="/">Home</a></nav>
  loading fallback { <p>loading…</p> } { <main><Outlet /></main> }
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
// the app's own component is `.rx`, and applies the router's; the router renders the layout there, and the layout's
// pages at its outlet
import { App } from "./main.rx"
import { Root, Home, Person } from "./pages.rx"
import { AppRouter, Outlet } from "./router.js"
export default component nests(children in component) = {
  component: App,
  children: [{ component: Root, children: [{ component: Home }, { component: Person }] }]
}
```

A host renders its records *among the children* of the component a record
names (MO-11i). An `.rx` component has two ways to say where those are:
`{props.children}`, and a component of the host's own that it applies —
the router's `<Outlet />` in a layout, the router's component in the app's
entry. The second is JavaScript, so the declaration says which components
they are, by importing them from their JS module (MO-14f): where a
component the view names applies one, the records nested in it are
rendered, under whatever that component has around the application and
whatever the applied component's own row provides.

So the view names the app's own component, with the root layout as its
child: what `App` puts around `<AppRouter />` holds every page, and the
router's context comes from `AppRouter`'s row (`provides(router)`), not
from the view — `App` itself is outside the router.

## Program

```rx
import { AppRouter } from "./router.js"
import { NotFound } from "./people.js"
export default component App() {
  <header>Directory</header>
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } { <AppRouter /> }
}
```

Accepted: `Person` can fail with `NotFound`, waits, and reads the router.
The app's `errored` region is around the router's component, the layout's
`loading` region around its outlet, and `AppRouter` provides the router to
what it renders.

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { AppRouter } from "./router.js"
export default component App() {
  <header>Directory</header>
  <AppRouter />
}
```

Nothing around the router's component discharges `NotFound`, and the
layout has no `errored` region of its own.

```rx
-- reject: UNHANDLED_FAILURE
import { AppRouter } from "./router.js"
import { NotFound } from "./people.js"
export default component App() {
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } { <header>Directory</header> }
  <AppRouter />
}
```

The region is the app's, and the pages are rendered where it applies the
router's component: beside the region, it holds none of them.

```rx
-- reject: CONTEXT_NOT_FOUND
import { AppRouter, useParams } from "./router.js"
import { NotFound } from "./people.js"
export default component App() {
  at = useParams()
  <header>{at.id}</header>
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } { <AppRouter /> }
}
```

The router is provided by `AppRouter` to what it renders. A hook in the
app's own component, above it, is outside the router.

```rx
-- reject: NESTED_NOT_RENDERED
import { NotFound } from "./people.js"
export default component App() {
  <header>Directory</header>
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } { <p>no router</p> }
}
```

The view nests the root layout in `App`, and `App` renders neither
`props.children` nor a component the host renders through: the pages
would never show, and the declaration is refused rather than left
unchecked (MO-11i). The same holds for a layout: `Root` without its
`<Outlet />`, or with an outlet the declaration does not import, is
refused (`ref/units.ts` and the crate's `modules.rs`,
`a_host_declaration_places_the_components_a_js_host_renders`).
