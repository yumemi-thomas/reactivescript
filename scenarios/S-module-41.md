# S-module-41 — code-based routes under a host declaration: a layout's regions hold its pages

Rules: MO-14h, MO-11u, MO-14d, MO-14f, R-f-5, RG-7b.

## Modules

```rx
-- module: ./router.d.rx
// a router whose routes are made in code: each route is given its component, and the provider renders the tree
export context router
export pure fn createRootRoute(options: { component: Component }): unknown renders(RouterProvider)
export pure fn createRoute(options: { getParentRoute: () => unknown; path: string; component: Component }): unknown renders(RouterProvider)
export pure fn createRouter(options: { routeTree: unknown }): unknown instantiates
export pure fn tree(root: unknown, children: unknown[]): unknown
export pure fn useParams(): { id: string } instantiates uses(router)
export component RouterProvider(props: { router: unknown }) provides(router)
export component Outlet(props: {}) uses(router)
```

```rx
-- module: ./people.d.rx
export error NotFound
export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)
```

```rx
-- module: ./host.d.rx
// what the router does with the components it was given: read off the router's own tree (rx-declare --host --routes
// ./main.rx, MO-14g), not restated by hand
import { App, Root, Home, Person } from "./main.rx"
import { RouterProvider, Outlet } from "./router.js"
export default component nests(children in component) = [
  { component: App, children: [{ component: Root, children: [{ component: Home }, { component: Person }] }] }
]
```

`createRoute({ component })` says `renders(RouterProvider)` (MO-11u): the
page is rendered later, beneath the provider. That is all a fn's row can
say, so the pages are checked side by side beneath it, and a layout's
`errored` region around its `<Outlet />` is credited to no page — the
program below was refused until 2026-11-25 (`UNHANDLED_FAILURE`, "no
errored region above an application of `<RouterProvider>`"), and a page
had to hold its own failure.

Which route is whose child is the router's own knowledge, and a host
declaration says it (MO-14): here it is derived from the router object
itself. Where a program is under a host declaration whose view places a
component, and the declaration says the host renders through H, a
`renders(H)` fn's row has nothing to add for that component: the view
says *where* beneath H. It is checked there (MO-14h) — under the layout's
regions, the app's provisions, and what the provider's own row provides.

## Program

```rx
import { createRootRoute, createRoute, createRouter, tree, useParams, RouterProvider, Outlet } from "./router.js"
import { fetchPerson, NotFound } from "./people.js"
context accent: string
export component Root() {
  <nav>people</nav>
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <main><Outlet /></main> }
  }
}
export component Home() {
  <h1 class={use accent}>People</h1>
}
export component Person() {
  params = useParams()
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({ component: Root })
indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: peek tree(rootRoute, [indexRoute, personRoute]) })
export default component App() {
  provide accent = "dark"
  <RouterProvider router={router} />
}
```

Accepted: `Person` waits, can fail with `NotFound` and reads the router;
the root layout's regions are around its outlet, the app's provision
above the provider.

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { createRootRoute, createRoute, createRouter, tree, useParams, RouterProvider, Outlet } from "./router.js"
import { fetchPerson, NotFound } from "./people.js"
context accent: string
export component Root() {
  <nav>people</nav>
  loading fallback { <p>loading…</p> } { <main><Outlet /></main> }
}
export component Home() {
  <h1 class={use accent}>People</h1>
}
export component Person() {
  params = useParams()
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({ component: Root })
indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: peek tree(rootRoute, [indexRoute, personRoute]) })
export default component App() {
  provide accent = "dark"
  <RouterProvider router={router} />
}
```

The layout without its `errored` region: the page's failure is held by
nothing, and is the declaration's to report.

```rx
-- reject: CONTEXT_NOT_FOUND
import { createRootRoute, createRoute, createRouter, tree, useParams, RouterProvider, Outlet } from "./router.js"
import { fetchPerson, NotFound } from "./people.js"
context accent: string
export component Root() {
  <nav>people</nav>
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <main><Outlet /></main> }
  }
}
export component Home() {
  <h1 class={use accent}>People</h1>
}
export component Person() {
  params = useParams()
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({ component: Root })
indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: peek tree(rootRoute, [indexRoute, personRoute]) })
export default component App() {
  <RouterProvider router={router} />
}
```

What the app provides above the provider still holds every page: without
it, `Home`'s `use accent` finds none.

```rx
-- reject: CONTEXT_NOT_FOUND
import { createRootRoute, createRoute, createRouter, tree, useParams, RouterProvider, Outlet } from "./router.js"
import { fetchPerson, NotFound } from "./people.js"
context accent: string
export component Root() {
  <nav>people</nav>
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <main><Outlet /></main> }
  }
}
export component Home() {
  <h1 class={use accent}>People</h1>
}
export component Person() {
  params = useParams()
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
component Extra() {
  params = useParams()
  <p>{params.id}</p>
}
rootRoute = createRootRoute({ component: Root })
indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
extraRoute = createRoute({ getParentRoute: () => rootRoute, path: "/extra", component: Extra })
router = createRouter({ routeTree: peek tree(rootRoute, [indexRoute, personRoute, extraRoute]) })
export default component App() {
  provide accent = "dark"
  <Extra />
  <RouterProvider router={router} />
}
```

A component the view does not place keeps the fn's row and every other
rule: `Extra` is given to a route (checked beneath the provider, where
the router is) and also applied by hand beside the provider, where it is
not.

Two components that render none of what the record nests in them, on the
record's one line: both are reported, by line and then by where each is written
(proposals/bugs/39).

```rx
-- reject: NESTED_NOT_RENDERED
import { createRootRoute, createRoute, createRouter, tree, useParams, RouterProvider, Outlet } from "./router.js"
import { fetchPerson, NotFound } from "./people.js"
context accent: string
export component Root() {
  <nav>people</nav>
  errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <main><span>root</span></main> }
  }
}
export component Home() {
  <h1 class={use accent}>People</h1>
}
export component Person() {
  params = useParams()
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({ component: Root })
indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: peek tree(rootRoute, [indexRoute, personRoute]) })
export default component App() {
  provide accent = "dark"
  <p>app</p>
}
```
