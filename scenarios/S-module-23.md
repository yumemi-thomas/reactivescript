# S-module-23 — nested routes in values: a child route renders at its parent's outlet

Rules: MO-11p, MO-11o, MO-11c, R-f-5, RG-4c.

## Modules

```rx
-- module: ./tsr.d.rx
// as @tanstack/solid-router declares it: a route renders under the one its getParentRoute names, at that one's <Outlet />
export context router
export pure fn createRootRoute(options: { component?: Component }): any renders(later)
export pure fn createRoute(options: { getParentRoute: () => any; path: string; component?: Component }): any renders(later) nests(component under getParentRoute)
export pure fn createRouter(options: { routeTree: any }): any instantiates
export component RouterProvider(props: { router: renders any }) provides(router)
export component Outlet(props: {}) uses(router) outlet
export pure fn useParams(opts: { from: string }): ref any uses(router)
```

```rx
-- module: ./people.d.rx
export error NotFound
export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)
```

`nests(component under getParentRoute)` beside `renders(later)` (MO-11p,
MO-11r) says where its result renders: its `component` renders among the children of
the component of the route its `getParentRoute` names, and `outlet` on a
JS component says it renders those children where it is written. So a
child route's component is checked at its parent's `<Outlet />`: the
parent's `errored`, `loading` and `provide` around the outlet reach it,
as a layout's do around `props.children`.

## Program

```rx
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from "./tsr.js"
import { fetchPerson, NotFound } from "./people.js"
component Root() {
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <main><Outlet /></main> }
  }
}
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
component Team() {
  person = await fetchPerson("lead")
  <h2>{person.name}</h2>
}
rootRoute = createRootRoute({ component: Root })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
teamRoute = createRoute({ getParentRoute: () => personRoute, path: "team", component: Team })
router = createRouter({ routeTree: peek rootRoute.addChildren([personRoute.addChildren([teamRoute])]) })
export default component App() {
  <RouterProvider router={router} />
}
```

Accepted. `Person` and, through it, `Team` render inside `Root`'s
boundaries; `Team` sits under `Person`, which has no `<Outlet />`, so at
run time it never renders, and nothing it fails with is anyone's.

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from "./tsr.js"
import { fetchPerson, NotFound } from "./people.js"
component Root() {
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <p>home</p> }
  }
  <main><Outlet /></main>
}
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({ component: Root })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: peek rootRoute.addChildren([personRoute]) })
export default component App() {
  <RouterProvider router={router} />
}
```

The outlet is outside the boundary: `Person`'s `NotFound` reaches none.

```rx
-- reject: UNHANDLED_FAILURE
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet } from "./tsr.js"
import { fetchPerson, NotFound } from "./people.js"
component Root() {
  <main><Outlet /></main>
}
component Shell() {
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <Outlet /> }
  }
}
component Team() {
  person = await fetchPerson("lead")
  <h2>{person.name}</h2>
}
rootRoute = createRootRoute({ component: Root })
shellRoute = createRoute({ getParentRoute: () => rootRoute, path: "/shell", component: Shell })
teamRoute = createRoute({ getParentRoute: () => rootRoute, path: "/team", component: Team })
router = createRouter({ routeTree: peek rootRoute.addChildren([shellRoute, teamRoute]) })
export default component App() {
  <RouterProvider router={router} />
}
```

A sibling's boundary is not credited: `Team` renders at `Root`'s outlet,
not `Shell`'s.
