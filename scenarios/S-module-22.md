# S-module-22 — a route tree given to a factory of the app's own: what `renders(later)` said

Rules: MO-8r, MO-11f, MO-11i, MO-11s, MO-12, E-10, R-f-5, RG-7b.

## Modules

```rx
-- module: ./routes.d.rx
// the app's own module around @tanstack/solid-router (a few lines of JavaScript): it is given the tree as records and
// hands back the component that renders it, as @solidjs/router's factory does
export context router
export pure fn createAppRouter(tree: { component: Component; children: { path: string; component: Component }[] }): Component provides(router) nests(children in component)
export component Link(props: { to: string; children?: View }) uses(router)
export pure fn useParams(opts: { from: string }): ref any uses(router)
```

```rx
-- module: ./tsr.d.rx
// the library's own functions, with no word: a component given to one is checked under a root of its own (MO-11s)
export context router
export pure fn createRootRoute(options: { component?: Component }): any instantiates
export pure fn createRouter(options: { routeTree: any }): any instantiates
export pure fn useParams(opts: { from: string }): ref any uses(router)
```

```rx
-- module: ./old.d.rx
// as the library was declared until 2026-11-23
export context router
export pure fn createRootRoute(options: { component?: Component }): any renders(later)
```

```rx
-- module: ./oldprop.d.rx
export context router
export component RouterProvider(props: { router: renders any }) provides(router)
```

```rx
-- module: ./people.d.rx
export error NotFound
export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)
```

TanStack Router's routes are values: `createRoute({ component: Person })`
makes a route object, `rootRoute.addChildren([…])` a tree of them,
`createRouter({ routeTree })` a router, and `<RouterProvider router={…}>`
renders the routes' components under its context. `renders(later)` on a
fn said its result carries the components in its arguments, and `renders`
on a JS component's prop that it renders what its value carries (MO-11o),
until 2026-11-23. One library wrote them, and they are withdrawn (MO-8r):
each is refused by name, with what is written instead.

What is written instead is a factory (MO-11f): a fn of the app's own
JavaScript that is given the tree as records — a layout's `component`, and
its pages in `children` — and hands back the component that renders it. It
is declared with the words `@solidjs/router`'s factory has:
`provides(router)` reaches every component of the tree, and
`nests(children in component)` puts each page among its layout's children
(MO-11i), so the layout's boundaries around `props.children` hold the
pages' failures and waits. The module builds the library's routes from the
records and renders the layout with the library's `<Outlet />` as its
children.

## Program

```rx
import { createAppRouter, Link, useParams } from "./routes.js"
import { fetchPerson, NotFound } from "./people.js"
component Root(props: { children?: View }) {
  <nav><Link to="/">Home</Link></nav>
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <main>{props.children}</main> }
  }
}
component Home() {
  <h1>People</h1>
}
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
AppRouter = createAppRouter({ component: Root, children: [{ path: "/", component: Home }, { path: "/people/$id", component: Person }] })
export default component App() {
  <header>Directory</header>
  <AppRouter />
}
```

Accepted: `Root`'s `<Link>` and `Person`'s `useParams` are under the
factory's `provides(router)`, and `Person`'s `NotFound` and its first load
are held by the layout's regions around `props.children`.

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { createAppRouter, useParams } from "./routes.js"
import { fetchPerson, NotFound } from "./people.js"
component Root(props: { children?: View }) {
  loading fallback { <p>loading…</p> } { <main>{props.children}</main> }
}
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
AppRouter = createAppRouter({ component: Root, children: [{ path: "/people/$id", component: Person }] })
export default component App() {
  <AppRouter />
}
```

A page's failure reaches the layout's children, and nothing there holds it.

```rx
-- reject: CONTEXT_NOT_FOUND
import { createAppRouter, useParams } from "./routes.js"
component Root(props: { children?: View }) {
  <main>{props.children}</main>
}
component Home() {
  <h1>People</h1>
}
AppRouter = createAppRouter({ component: Root, children: [{ path: "/", component: Home }] })
export default component App() {
  where = useParams({ from: "/" })
  <p>{where.id}</p>
  <AppRouter />
}
```

A hook of the router outside the component the factory made: its context
is provided to what that component renders, not beside it.

```rx
-- reject: CONTEXT_NOT_FOUND
import { createAppRouter, useParams } from "./routes.js"
component Root(props: { children?: View }) {
  <main>{props.children}</main>
}
component Person() {
  params = useParams({ from: "/people/$id" })
  <h1>{params.id}</h1>
}
AppRouter = createAppRouter({ component: Root, children: [{ path: "/people/$id", component: Person }] })
export default component App() {
  <AppRouter />
  <Person />
}
```

A page applied by hand as well, beside the router.

```rx
-- reject: CONTEXT_NOT_FOUND
import { createRootRoute, useParams } from "./tsr.js"
component Person() {
  params = useParams({ from: "/people/$id" })
  <h1>{params.id}</h1>
}
rootRoute = createRootRoute({ component: Person })
export default component App() {
  <p>{rootRoute ? "routes" : ""}</p>
}
```

The library's own `createRootRoute`, with no word: the component it is
given is checked under a root of its own, where nothing is provided
(MO-11s). That is the reading a route tree written in `.rx` has now, and
why the tree is given to a factory.

```rx
-- reject: PARSE
import { createRootRoute } from "./old.js"
export default component App() {
  <p>{createRootRoute ? "routes" : ""}</p>
}
```

`renders(later)` is refused by name, with what to write.

```rx
-- reject: PARSE
import { RouterProvider } from "./oldprop.js"
export default component App() {
  <RouterProvider />
}
```

So is `renders` before a prop's type.

```rx
-- reject: ASYNC_OUTSIDE_LOADING_BOUNDARY
-- spa
import { createAppRouter, useParams } from "./routes.js"
import { fetchPerson, NotFound } from "./people.js"
component Root(props: { children?: View }) {
  errored fallback(e: NotFound) { <p>{e.message}</p> } { <main>{props.children}</main> }
}
component Person() {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
}
AppRouter = createAppRouter({ component: Root, children: [{ path: "/people/$id", component: Person }] })
export default component App() {
  <AppRouter />
}
```

In a client-only build a page that waits needs a `loading` region above
it (CN-3d): the layout's, around its children.

```rx
-- accept
import { createRootRoute, createRouter } from "./tsr.js"
rootRoute = createRootRoute({})
router = createRouter({ routeTree: rootRoute })
tree = createRouter({ routeTree: peek rootRoute.addChildren([]) })
export default component App() {
  <p>{router ? "made" : ""}{tree ? "" : "none"}</p>
}
```

The library's values, with no component in them, are values like any
other. An instance a primitive made never changes, so reading it in
another instantiation's arguments (`createRouter({ routeTree: rootRoute
})`) needs no `peek` (E-10). A method called on it is another matter: a
stable receiver says nothing of what a method gives back, which may read
state that changes. `addChildren` makes its tree once, and the program
says so where it passes it.

```rx
-- reject: SNAPSHOT_ARGUMENT
import { createRootRoute, createRouter } from "./tsr.js"
rootRoute = createRootRoute({})
router = createRouter({ routeTree: rootRoute.currentTree() })
export default component App() {
  <p>{router ? "made" : ""}</p>
}
```

What a method of the instance returns may change after the router is
made, so the argument is a snapshot: `peek rootRoute.currentTree()` if
that is meant.
