# S-module-23 — nested routes: a layout's regions around its children (what `nests(… under …)` and `outlet` said)

Rules: MO-8r, MO-11i, MO-11f, R-f-5, RG-4c.

## Modules

```rx
-- module: ./routes.d.rx
// the app's own module around a router whose routes link to their parent: the tree is written as records, each
// layout's pages in its `children`, and the module passes the library's outlet as the layout's children
export context router
export type Route = { path?: string; component: Component; children?: Route[] }
export pure fn createAppRouter(tree: Route): Component provides(router) nests(children in component)
export pure fn useParams(opts: { from: string }): ref any uses(router)
```

```rx
-- module: ./old.d.rx
// as the library was declared until 2026-11-23
export context router
export pure fn createRoute(options: { getParentRoute: () => any; path: string; component?: Component }): Component nests(component under getParentRoute)
```

```rx
-- module: ./oldoutlet.d.rx
export context router
export component Outlet(props: {}) uses(router) outlet
```

```rx
-- module: ./people.d.rx
export error NotFound
export pure fn fetchPerson(id: string): Promise<{ name: string }> rejects(NotFound)
```

`nests(component under getParentRoute)` beside `renders(later)` said where
a route's component renders — among the children of the component of the
route its `getParentRoute` names — and `outlet` on a JS component that it
renders those children where it is written (MO-11p), until 2026-11-23.
They existed for `renders(later)`, one library wrote them, and they are
withdrawn with it (MO-8r).

The tree is written as records instead, each layout's pages in its
`children`, and given to a factory declared `nests(children in component)`
(MO-11i): each entry of a record's `children` is checked among the
children of that record's `component`, at any depth. A layout renders its
pages as `props.children`, so its `errored`, `loading` and `provide`
around them reach the pages, and a sibling's do not.

## Program

```rx
import { createAppRouter, useParams } from "./routes.js"
import { fetchPerson, NotFound } from "./people.js"
component Root(props: { children?: View }) {
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <main>{props.children}</main> }
  }
}
component Person(props: { children?: View }) {
  params = useParams({ from: "/people/$id" })
  person = await fetchPerson(params.id)
  <h1>{person.name}</h1>
  <section>{props.children}</section>
}
component Team() {
  person = await fetchPerson("lead")
  <h2>{person.name}</h2>
}
AppRouter = createAppRouter({ component: Root, children: [{ path: "/people/$id", component: Person, children: [{ path: "team", component: Team }] }] })
export default component App() {
  <AppRouter />
}
```

Accepted. `Person` and, through it, `Team` render inside `Root`'s regions.

## Rejected variants

```rx
-- reject: UNHANDLED_FAILURE
import { createAppRouter, useParams } from "./routes.js"
import { fetchPerson, NotFound } from "./people.js"
component Root(props: { children?: View }) {
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { <p>home</p> }
  }
  <main>{props.children}</main>
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

The children are rendered outside the boundary: `Person`'s `NotFound`
reaches none.

```rx
-- reject: UNHANDLED_FAILURE
import { createAppRouter } from "./routes.js"
import { fetchPerson, NotFound } from "./people.js"
component Root(props: { children?: View }) {
  <main>{props.children}</main>
}
component Shell(props: { children?: View }) {
  errored fallback(e: NotFound) { <p>{e.message}</p> } {
    loading fallback { <p>loading…</p> } { {props.children} }
  }
}
component Team() {
  person = await fetchPerson("lead")
  <h2>{person.name}</h2>
}
AppRouter = createAppRouter({ component: Root, children: [{ path: "/shell", component: Shell }, { path: "/team", component: Team }] })
export default component App() {
  <AppRouter />
}
```

A sibling's boundary is not credited: `Team` is among `Root`'s children,
not `Shell`'s.

```rx
-- reject: PARSE
import { createRoute } from "./old.js"
export default component App() {
  <p>{createRoute ? "routes" : ""}</p>
}
```

`nests(component under parent)` is refused by name, with what to write.

```rx
-- reject: PARSE
import { Outlet } from "./oldoutlet.js"
export default component App() {
  <Outlet />
}
```

So is `outlet`.
