# S-module-22 — components that travel in values: a route tree, rendered by the provider it is given to

Rules: MO-11o, MO-11c, MO-12, E-10, R-f-5, RG-4a.

## Modules

```rx
-- module: ./tsr.d.rx
// as @tanstack/solid-router declares it: routes carry their components, the provider renders what its router carries
export context router
export pure fn createRootRoute(options: { component?: Component }): { addChildren: (children: any[]) => any } renders(later)
export pure fn createRoute(options: { getParentRoute: () => any; path: string; component?: Component }): { addChildren: (children: any[]) => any } renders(later)
export pure fn createRouter(options: { routeTree: any }): any instantiates
export component RouterProvider(props: { router: renders any }) provides(router)
export component Outlet(props: {}) uses(router)
export component Inspector(props: { router: any })
export pure fn useParams(opts: { from: string }): ref any uses(router)
```

```rx
-- module: ./people.d.rx
export error NotFound
export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)
```

TanStack Router's routes are values: `createRoute({ component: Person })`
makes a route object, `rootRoute.addChildren([…])` a tree of them,
`createRouter({ routeTree })` a router, and `<RouterProvider router={…}>`
renders the routes' components under its context. `renders(later)` on a fn
says its result carries the components in its arguments (MO-11r), and so does any value
computed from it (`rootRoute.addChildren([…])`, `createRouter(…)`);
`renders` on a JS component's prop says it renders the components its
value carries. They are checked as applied there, among its children
(MO-11c), so the provider's `provides(router)` reaches them and its
boundaries hold their failures. A route's nested components render at
`<Outlet />`; they are checked as siblings under the provider, which errs
strict (a boundary inside the parent's component is not credited to them).

An instance a primitive made never changes, so reading it in another
instantiation's arguments (`createRouter({ routeTree: rootRoute.… })`)
needs no `peek` (E-10). A method called on it keeps that only when the
declaration names the method on the result (`{ addChildren: (children:
any[]) => any }`): a stable receiver says nothing of what an undeclared
method gives back, which may read state that changes (RFC 14, bounded
2026-11-21).

## Program

```rx
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from "./tsr.js"
import { fetchPerson, NotFound } from "./people.js"
component Root() {
  <main><Outlet /></main>
}
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <h1>{person.name}</h1> }
  }
}
rootRoute = createRootRoute({ component: Root })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: rootRoute.addChildren([personRoute]) })
export default component App() {
  <RouterProvider router={router} />
}
```

Accepted.

## Rejected variants

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet } from "./tsr.js"
component Root() {
  <main><Outlet /></main>
}
rootRoute = createRootRoute({ component: Root })
router = createRouter({ routeTree: rootRoute.currentTree() })
export default component App() {
  <RouterProvider router={router} />
}
```

`currentTree` is no method the declaration names: what it returns may
change after the router is made, so the argument is a snapshot (write
`peek rootRoute.currentTree()` if that is meant, or declare the method).

```rx
-- reject: UNHANDLED_FAILURE
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from "./tsr.js"
import { fetchPerson } from "./people.js"
component Root() {
  <main><Outlet /></main>
}
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  loading fallback { <p>loading…</p> } { <h1>{person.name}</h1> }
}
rootRoute = createRootRoute({ component: Root })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: rootRoute.addChildren([personRoute]) })
export default component App() {
  <RouterProvider router={router} />
}
```

The route's component is checked where the provider renders it: its
`NotFound` reaches no boundary.

```rx
-- reject: COMPONENT_AS_VALUE
import { createRootRoute, createRoute, createRouter, Inspector, Outlet } from "./tsr.js"
component Root() {
  <main><Outlet /></main>
}
rootRoute = createRootRoute({ component: Root })
router = createRouter({ routeTree: rootRoute.addChildren([]) })
export default component App() {
  <Inspector router={router} />
}
```

Nothing renders what the route carries (`Inspector`'s prop is no
`renders`), so `Root` would be checked nowhere: it is refused where it is
passed.

```rx
-- reject: CONTEXT_NOT_FOUND
import { useParams } from "./tsr.js"
component Person() {
  params = useParams({ from: "/people/$id" })
  <h1>{params.id}</h1>
}
export default component App() {
  <Person />
}
```

The hooks still need the router above them.
