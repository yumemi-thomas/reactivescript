# S-module-22 — components that travel in values: a route tree, rendered by the provider it is given to

Rules: MO-11o, MO-11c, MO-12, E-10, R-f-5, RG-4a.

## Modules

```rx
-- module: ./tsr.d.rx
// as @tanstack/solid-router declares it: routes carry their components, the provider renders what its router carries
export context router
export pure fn createRootRoute(options: { component?: Component }): any renders(later) methods(addChildren)
export pure fn createRoute(options: { getParentRoute: () => any; path: string; component?: Component }): any renders(later) methods(addChildren)
export pure fn createRouter(options: { routeTree: any }): any instantiates
export component RouterProvider(props: { router: renders any }) provides(router)
export component Outlet(props: {}) uses(router)
export component Inspector(props: { router: any })
export pure fn useParams(opts: { from: string }): ref any uses(router)
```

```rx
-- module: ./routes.rx
import { createRootRoute, createRouter, RouterProvider, Outlet } from "./tsr.js"
component Root() {
  <main><Outlet /></main>
}
rootRoute = createRootRoute({ component: Root })
export router = createRouter({ routeTree: rootRoute.addChildren([]) })
export component Here() {
  <RouterProvider router={router} />
}
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
declaration names the method, `methods(addChildren)` after the signature:
a stable receiver says nothing of what an undeclared method gives back,
which may read state that changes (RFC 14, bounded 2026-11-21).

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

`currentTree` is not among the `methods(…)` the declaration names: what
it returns may change after the router is made, so the argument is a
snapshot (write `peek rootRoute.currentTree()` if that is meant, or
declare the method).

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

```rx
-- reject: RENDERS_ESCAPES
import { RouterProvider } from "./tsr.js"
import { router } from "./routes.rx"
export default component App() {
  <RouterProvider router={router} />
}
```

`routes.rx` checks the components its router carries where it renders it
(`Here`); exported (as `examples/tanstack` exports its router, for its
type), the router may be imported, but rendering it in another module is
refused: that module's signature does not say what the carried components
need, so nothing would check them under this provider (MO-11o, revised
2026-11-21).

```rx
-- reject: RENDERS_ESCAPES
import { RouterProvider } from "./tsr.js"
import { router } from "./routes.rx"
export default component App() {
  alias = router
  <RouterProvider router={alias} />
}
```

An alias of the imported router, or a record field holding it, is the
imported router.

```rx
-- reject: RENDERS_ESCAPES
import { RouterProvider } from "./tsr.js"
import { router } from "./routes.rx"
export default component App() {
  box = { r: router }
  <RouterProvider router={box.r} />
}
```

What a `renders` prop is given is named by mention (ruled 2026-11-22,
MO-10k): every name its expression's value may come from is followed to
the carrying calls it was bound to, whatever is in between — a branch, a
call, a closure's result. Nothing is followed into a value: the names are.

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetchPerson } from "./people.js"
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from "./tsr.js"
component Root() { <main><Outlet /></main> }
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({ component: Root })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: rootRoute.addChildren([personRoute]) })
pick = (r) => r
export default component App() {
  source dev := false
  <RouterProvider router={dev ? pick(router) : (() => router)()} />
}
```

`Person` can fail, and no `errored` is above the provider: the router is
reached through `?:`, a call and a closure, and its components are checked
there all the same.

A value that comes from where the checker cannot look — a parameter, a
source, a provision — may carry components nothing names here, so they
would render unchecked: a `renders` prop refuses it.

A prop is the exception, when the component gives it on as it is
(2026-11-22): `Shell` renders what its `router` prop carries, so the prop
is itself one that renders, in `Shell`'s summary and its signature
(`router: renders provides(./tsr.d.rx#router)`), and the components are
named, and checked, where `Shell` is applied — under `Shell`'s own
boundaries around the provider, then the application's. A router wrapped
in the app's own frame, in this module or another, is the ordinary case.

```rx
-- accept
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from "./tsr.js"
component Root() { <main><Outlet /></main> }
component Person() {
  params = useParams({ from: "/people/$id" })
  <h1>{params.id}</h1>
}
rootRoute = createRootRoute({ component: Root })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: rootRoute.addChildren([personRoute]) })
component Shell(props: { router: any; title: string }) {
  <header>{props.title}</header>
  <RouterProvider router={props.router} />
}
export default component App() {
  <Shell router={router} title="People" />
}
```

The components are checked there as they are under the provider itself: a
page that can fail needs its boundary above where `Shell` renders it.

```rx
-- reject: UNHANDLED_FAILURE
import pure { fetchPerson } from "./people.js"
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet, useParams } from "./tsr.js"
component Root() { <main><Outlet /></main> }
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
rootRoute = createRootRoute({ component: Root })
personRoute = createRoute({ getParentRoute: () => rootRoute, path: "/people/$id", component: Person })
router = createRouter({ routeTree: rootRoute.addChildren([personRoute]) })
component Shell(props: { router: any }) {
  <RouterProvider router={props.router} />
}
export default component App() {
  <Shell router={router} />
}
```

And what `Shell` is given must be a value whose components can be named
where it is applied: a source cannot.

```rx
-- reject: RENDERS_ESCAPES
import { createRootRoute, createRouter, RouterProvider, Outlet } from "./tsr.js"
component Root() { <main><Outlet /></main> }
rootRoute = createRootRoute({ component: Root })
source current: any := createRouter({ routeTree: rootRoute })
component Shell(props: { router: any }) {
  <RouterProvider router={props.router} />
}
export default component App() {
  <Shell router={current} />
}
```

A prop that reaches the provider any other way than as it is read
(`props.router`) — through a local name, a record — is still one the
checker cannot name:

```rx
-- reject: RENDERS_ESCAPES
import { RouterProvider } from "./tsr.js"
component Shell(props: { router: any }) {
  r = props.router
  <RouterProvider router={r} />
}
export default component App() {
  <Shell router={null} />
}
```

```rx
-- reject: RENDERS_ESCAPES
import { createRootRoute, createRouter, RouterProvider, Outlet } from "./tsr.js"
component Root() { <main><Outlet /></main> }
rootRoute = createRootRoute({ component: Root })
source current: any := createRouter({ routeTree: rootRoute })
export default component App() {
  <RouterProvider router={current} />
}
```

```rx
-- reject: RENDERS_ESCAPES
import { createRootRoute, createRouter, RouterProvider, Outlet } from "./tsr.js"
component Root() { <main><Outlet /></main> }
context routerCtx: any
rootRoute = createRootRoute({ component: Root })
router = createRouter({ routeTree: rootRoute })
component Shell() {
  <RouterProvider router={use routerCtx} />
}
export default component App() {
  provide routerCtx = router
  <Shell />
}
```
